var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');
var util = require('util');
var yaml = require('js-yaml');

var debug = process.env.DEBUG || false;
var backendUrl = process.env.BACKEND_URL;

// Setup log system.
var winston = require('winston');
require('winston-loggly');

var winstonTransports = {
  transports: [
    new(winston.transports.Console)({
      colorize: 'all',
      timestamp: true,
      level: (debug) ? 'debug' : 'info'
    })
  ]
};

if (process.env.LOGGLY_TOKEN && process.env.LOGGLY_SUBDOMAIN) {
  winstonTransports.transports.push(
    new(winston.transports.Loggly)({
      inputToken: process.env.LOGGLY_TOKEN,
      subdomain: process.env.LOGGLY_SUBDOMAIN,
      tags: ['shoov-nodejs'],
      json: true
    })
  );
}

var log = new(winston.Logger)(winstonTransports);

// Invoke a PR.
router.get('/:buildItemId/:accessToken', function(req, res, next) {
  var buildItemId = req.params.buildItemId;
  var accessToken = req.params.accessToken;

  log.info('Request received for CI Build Item ID %d', buildItemId);

  var options = {
    url: backendUrl + '/api/ci-build-items/' + buildItemId,
    method: 'PATCH',
    qs: {
      access_token: accessToken
    },
    form: {
      status: 'in_progress'
    }
  };

  var ciBuildItem;
  var userDetail;
  var buildDetail;

  // Set the build status to "in progress" and receive CI Build Item data.
  request(options)
    .then(function(response) {
      ciBuildItem = JSON.parse(response).data[0];
      return getUser(accessToken);
    })
    // Get user data assigned with CI Build Item.
    .then(function(response) {
      userDetail = JSON.parse(response).data[0];
      return getBuild(ciBuildItem.build, accessToken);
    })
    // Get the repository name from the CI Build.
    .then(function(response) {
      buildDetail = JSON.parse(response).data[0];
      var userName = buildDetail.label.split('/')[0];
      var repositoryName = buildDetail.label.split('/')[1];
      return getShoovConfig(userName, repositoryName, buildDetail.git_branch, userDetail.github_access_token);
    })
    // Get Shoov configuration file from repository.
    .then(function(response) {
      if (!response) {
        throw new Error("Can't get .shoov.yml");
      }

      try {
        var data = JSON.parse(response);
        var contentDecoded = new Buffer(data.content, 'base64').toString('utf8');
        var shoovConfig = yaml.safeLoad(contentDecoded);
      }
      catch (e) {
        throw new Error('Invalid .shoov.yml: ' + err.message);
      }

      if (!shoovConfig) {
        throw new Error('.shoov.yml is empty');
      }
      
      // Determine the need in silenium container.
      var withSelenium = (shoovConfig.addons && shoovConfig.addons.indexOf('selenium') > -1) || false;

      // Execute containers.
      return execDocker(ciBuildItem.build, buildItemId, accessToken, withSelenium);
    })
    .then(function(response) {
      // Convert ANSI colors to HTML.
      if (!response || !response.log) {
        throw new Error('Invalid response from Docker');
      }
      options.form.log = ansi2html(response.log);
      // Set the build status to "done" or "error" by the exit code.
      options.form.status = !response.exitCode ? 'done' : 'error';
      return request(options);
    })
    .then(function(response) {
      var json = JSON.parse(response);
      if (json.data) {
        log.info('Build Item ID %d has finished and data uploaded to backend.', buildItemId);
      }
      else {
        log.error('Response from backend is invalid.', { response: response });
      }
    })
    .catch(function(err) {
      log.error('Error while processing CI Build Item ID %d', buildItemId, { errMesage: err.message });
    });

  res.json( { message: 'Request accepted' } );
});


/**
 * Receive a user data for specific REST token.
 *
 * @param accessToken
 *  Drupal restful private user token
 *
 * @returns {Promise}
 *  HTTP Response in promise wrapper.
 */
var getUser = function(accessToken) {
  var options = {
    url: backendUrl + '/api/me/',
    qs: {
      access_token: accessToken,
      fields: 'id,label,github_access_token',
      github_access_token: true
    }
  };

  return request(options);
};

/**
 * Get CI Build data.
 *
 * @param buildId
 *  The build ID.
 * @param accessToken
 *  Drupal restful private user token
 *
 * @returns {Promise}
 *  HTTP Response in promise wrapper.
 */
var getBuild = function(buildId, accessToken) {
  var options = {
    url: backendUrl + '/api/ci-builds/' + buildId,
    qs: {
      access_token: accessToken,
      fields: 'id,label,git_branch,repository,private_key'
    }
  };

  return request(options);
};

/**
 * Get shoov configuration file from user repository.
 *
 * @param userName
 *  The owner username of repository.
 * @param repositoryName
 *  The repository name.
 * @param accessToken
 *  Drupal restful private user token
 *
 * @returns {Promise}
 *  HTTP response in promise wrapper.
 */
var getShoovConfig = function(userName, repositoryName, branchName, accessToken) {
  var options = {
    'url': 'https://api.github.com/repos/' + userName + '/' + repositoryName + '/contents/.shoov.yml?ref=' + branchName,
    'headers': {
      'Authorization': 'token ' + accessToken,
      'User-Agent': 'Shoov.io'
    }
  };

  return request(options)
    .then(function(result) {
      return result;
    })
    .catch(function(err) {
      if (err.statusCode == 404) {
        log.error('.shoov.yml not exist in repository %s/%s', userName, repositoryName);
      }
      else {
        log.error("Can't get .shoov.yml in %s/%s", userName, repositoryName, { errMessage: err.message } );
      }
    });
};

/**
 * Execute all dockers containers.
 *
 * @param buildId
 *  The ID of CI Build on the backend.
 * @param buildItemId
 *  The ID of CI Build Item on the backend.
 * @param accessToken
 *  Access token of user creator of CI Build.
 * @param withSelenium
 *  Determine the need execute the chain with silenium or not.
 *
 * @returns {Promise}
 */
var execDocker = function(buildId, buildItemId, accessToken, withSelenium) {
  // Init a docker object.
  var docker = new Docker();
  // All running containers.
  var containers = [];
  // Generate unique name for containers.
  var CIBuildContainerName = 'ci-build-' + buildItemId;
  var sileniumContainerName = 'silenium-' + buildItemId;
  // Determine a VNC password.
  var vncPassword = process.env.VNC_PASSOWRD || 'hola';
  var timeoutLimit = process.env.DOCKER_STARTUP_TIMEOUT || 30;
  var uptimeLimit = process.env.DOCKER_RUN_TIMEOUT || 1200;
  // Indicate if containers were already processed for remove.
  var removedContainers = false;

  /**
   * Creates and starts Selenium container.
   *
   * @returns {Promise}
   */
  var runSelenium = function() {
    return new Promise(function(resolve, reject) {
      // Skip creating Selenium container because user configuration doesn't support this step.
      if (!withSelenium) {
        return resolve(true);
      }

      // Determine if the container is ready, and can accept connections.
      var containerReady = false;

      log.info('Starting %s', sileniumContainerName);

      // Create Selenium container.
      docker.createContainer({
        'Image': 'elgalu/selenium:v2.46.0-base1',
        'Env': [
          'SCREEN_WIDTH=1920',
          'SCREEN_HEIGHT=1080',
          'VNC_PASSWORD=' + vncPassword,
          'WITH_GUACAMOLE=false'
        ],
        'name': sileniumContainerName
      }, function(err, container) {
        if (err) {
          log.error('Can\'t create the container %s', sileniumContainerName);
          return reject(err);
        }
        // Attach to container.
        container.attach({logs: true, stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            log.error('Can\'t attach to the container %s', sileniumContainerName);
            return reject(err);
          }
          // Save container in containers variable.
          containers.push(container);

          log.debug('%s container ID is %s', sileniumContainerName, container.id);

          // Start a new created container.
          container.start(function(err) {
            if (err) {
              log.error("Can't start the container %s", sileniumContainerName);
              return reject(err);
            }
            // Set timeout for the time for which the silenium server should start.
            setTimeout(function() {
              if (!containerReady) {
                var errMsg = util.format('%s couldn\'t start, and have timed out after %d seconds', sileniumContainerName, timeoutLimit);
                return reject(errMsg);
              }
            }, timeoutLimit * 1000);
            // Set timeout for the maximum uptime.
            setTimeout(function() {
              var errObj = new Error(util.format('%s execution has timed out after %d minutes', sileniumContainerName, uptimeLimit / 60));
              return reject(errObj);
            }, uptimeLimit * 1000);
          });
          // Read stream and wait until needed phrase.
          stream.on('data', function(chunk) {
            // And waiting for "Ready" string.
            var string = chunk.toString();
            if (string.indexOf('all done and ready for testing') > -1) {
              containerReady = true;
              log.info('Container %s is ready.', sileniumContainerName);
              return resolve(true);
            }
          });
        });
      });
    });
  };

  /**
   * Creates and starts CI Build container.
   *
   * @returns {Promise}
   */
  var runCIBuild = function() {
    return new Promise(function(resolve, reject) {
      // Result for save all output logs and exit code.
      var result = {
        log: '',
        exitCode: 0
      };

      // Predefine container options.
      var containerOptions = {
        'Image': 'amitaibu/php-ci',
        'Env': [
          'BACKEND_URL=' + backendUrl
        ],
        'Cmd': [
          '/home/shoov/main.sh',
          buildId,
          accessToken
        ],
        'name': CIBuildContainerName
      };

      // If shoov configuration contain silenium add-on and silenium container successfully
      // started then link CI Build container with Selenium container.
      if (withSelenium && sileniumContainerName) {
        containerOptions.HostConfig = {
          "Links": [sileniumContainerName + ':silenium']
        };

        log.info('Starting %s with Selenium add-on', CIBuildContainerName);
      }
      else {
        log.info('Starting %s', CIBuildContainerName);
      }

      // Create CI Build container.
      docker.createContainer(containerOptions, function(err, container) {
        if (err) {
          log.error('Can\'t create the container %s', CIBuildContainerName);
          return reject(err);
        }
        // Attach to container.
        container.attach({logs: true, stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            log.error('Can\'t attach to the container %s', CIBuildContainerName);
            return reject(err);
          }
          // Save container in containers variable.
          containers.push(container);

          log.debug('%s container ID is %s', CIBuildContainerName, container.id);

          // Read a stream.
          stream.on('data', function(chunk) {
            // Get the data from the terminal.
            result.log += chunk;
          });
          // Start a new created container.
          container.start(function(err) {
            if (err) {
              log.error('Can\'t start the container ', CIBuildContainerName);
              return reject(err);
            }
            // Set timeout for the maximum uptime.
            setTimeout(function() {
              var errObj = new Error(util.format('%s execution has timed out after %d minutes', CIBuildContainerName, uptimeLimit / 60));
              return reject(errObj);
            }, uptimeLimit * 1000);
          });
          // Waits for a container to end.
          container.wait(function(err, data) {
            if (err) {
              log.error('Error while the container %s is finished.', CIBuildContainerName);
              return reject(err);
            }

            log.info('%s container is finished.', CIBuildContainerName);

            // TODO: Figure out why it's happened.
            if (!result.log) {
              var errMsg = util.format('Output from %s container is empty with exit code %d', CIBuildContainerName, data.StatusCode);
              return reject(new Error(errMsg));
            }

            // Get the exit code.
            result.exitCode = data.StatusCode;
            resolve(result);
          });
        });
      });
    });
  };

  /**
   * Function stops and remove all ran containers.
   *
   * @returns {Promise}
   */
  var removeContainers = function() {
    removedContainers = true;
    return new Promise(function(resolve, reject) {
      // The count of the containers.
      var countContainers = containers.length;
      var removedContainers = 0;
      // Some options for remove command.
      var opts = {
        // Kill then remove the container.
        'force': true
      };
      // Start deleting every container.
      containers.forEach(function(container, index) {
        container.remove(opts, function(err, data) {
          if (err) {
            log.error('Can\'t delete the container %d', container.id);
            return reject(err);
          }

          log.debug('The container %s removed', container.id);

          removedContainers++;
          // If all containers are removed we can return.
          if (removedContainers >= countContainers) {
            resolve(true);
          }
        })
      });
    });
  };

  // Helper variable to get the CI container logs.
  var returnOutput = '';

  // Start a promise chain.
  return runSelenium()
    .then(runCIBuild)
    .then(function(result) {
      // Save log output in global variable.
      returnOutput = result;
    })
    .then(removeContainers)
    .then(function() {
      // After containers are removed we can return result.
      return returnOutput;
    })
    .catch(function(err) {
      // If error happened then remove all containers.
      if (!removedContainers) {
        // The error has originated not happened in removeContainers().
        removeContainers();
      }
      // And show error.
      log.error('Error while executing docker containers.', { errMessage: err.message });
    });

};

module.exports = router;
