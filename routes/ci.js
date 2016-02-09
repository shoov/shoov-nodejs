var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');
var util = require('util');
var yaml = require('js-yaml');

var debug = false;
var conf = {};
var log = {};

/**
 * Implements custom error type "FileNotFoundError".
 *
 * Extends Error object and indicates an error regarding the .shoov.yml file
 * is missing.
 *
 * @param message
 *  Error message
 */
function FileNotFoundError(message) {
  this.name = 'FileNotFoundError';
  this.message = (message || "");
}
FileNotFoundError.prototype = Error.prototype;

module.exports = function(config, logger) {

  // Make config, logger and debug global.
  conf = config;
  log = logger;
  debug = conf.get('debug');

  var backendUrl = conf.get('backend_url');

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
          // Send other type of an error if file doesn't exist at all.
          throw new FileNotFoundError("Can't get .shoov.yml");
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

        // Determine the need in selenium container.
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
        // Set status of CI build item to error if .shoov.yml file doesn't exist
        // or back to queue.
        options.form.status = err.name == 'FileNotFoundError' ? 'error' : 'queue';
        return request(options);
      })
      .catch(function(err) {
        log.error('Error while updating status of failed CI build item ID %d', buildItemId, { errMesage: err.message });
      });

    res.json( { message: 'Request accepted' } );
  });

  return router;
};

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
    url: conf.get('backend_url') + '/api/me/',
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
    url: conf.get('backend_url') + '/api/ci-builds/' + buildId,
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
 *  Determine the need execute the chain with selenium or not.
 *
 * @returns {Promise}
 */
var execDocker = function(buildId, buildItemId, accessToken, withSelenium) {
  // Init a docker object.
  var docker = new Docker();
  // All running containers.
  var containers = [];
  // Generate unique name for containers.
  var CIBuildContainerName = 'ci-build-' + buildItemId + '-' + Date.now();
  var seleniumContainerName = 'selenium-' + buildItemId  + '-' + Date.now();
  // Determine a VNC password.
  var vncPassword = conf.get('vnc_passowrd');
  var timeoutLimit = conf.get('docker_startup_timeout');
  var uptimeLimit = conf.get('docker_run_timeout');
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

      log.info('Starting %s', seleniumContainerName);

      // Create Selenium container.
      docker.createContainer({
        'Image': conf.get('selenium_docker_image'),
        'Env': [
          'SCREEN_WIDTH=1920',
          'SCREEN_HEIGHT=1080',
          'VNC_PASSWORD=' + vncPassword,
          'WITH_GUACAMOLE=false'
        ],
        'name': seleniumContainerName
      }, function(err, container) {
        if (err) {
          log.error('Can\'t create the container %s', seleniumContainerName);
          return reject(err);
        }
        // Attach to container.
        container.attach({logs: true, stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            log.error('Can\'t attach to the container %s', seleniumContainerName);
            return reject(err);
          }
          // Save container in containers variable.
          containers.push(container);

          log.info('%s selenium container ID is %s', seleniumContainerName, container.id);

          // Start a new created container.
          container.start(function(err) {
            if (err) {
              var errMsg = util.format("Can't start the container %s. Error = %s", seleniumContainerName, err);
              log.error(errMsg);
              return reject(errMsg);
            }
            // Set timeout for the time for which the selenium server should start.
            setTimeout(function() {
              if (!containerReady) {
                var errMsg = util.format('%s couldn\'t start, and have timed out after %d seconds', seleniumContainerName, timeoutLimit);
                return reject(errMsg);
              }
            }, timeoutLimit * 1000);
            // Set timeout for the maximum uptime.
            setTimeout(function() {
              var errObj = new Error(util.format('%s execution has timed out after %d minutes', seleniumContainerName, uptimeLimit / 60));
              return reject(errObj);
            }, uptimeLimit * 1000);
          });
          // Read stream and wait until needed phrase.
          log.info('Waiting for selenium container %s.', seleniumContainerName);

          stream.on('data', function(chunk) {
            // And waiting for "Ready" string.
            var string = chunk.toString();
            log.info(string);
            if (string.indexOf('all done and ready for testing') > -1) {
              containerReady = true;
              log.info('Selenium container %s is ready.', seleniumContainerName);
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
        'Image': conf.get('php_ci_docker_image'),
        'Env': [
          'BACKEND_URL=' + conf.get('backend_url')
        ],
        'Cmd': [
          '/home/shoov/main.sh',
          buildId,
          accessToken
        ],
        'name': CIBuildContainerName
      };

      if (debug) {
        log.debug('backendUrl: ' + conf.get('backend_url'));
        log.debug('buildId: ' + buildId);
        log.debug('accessToken: ' + accessToken);
      }

      // If shoov configuration contain selenium add-on and selenium container successfully
      // started then link CI Build container with Selenium container.
      if (withSelenium && seleniumContainerName) {
        containerOptions.HostConfig = {
          "Links": [seleniumContainerName + ':selenium']
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

          log.info('%s container ID is %s', CIBuildContainerName, container.id);

          // Read a stream.
          stream.on('data', function(chunk) {
            // Get the data from the terminal.
            log.info(chunk.toString());
            result.log += chunk;
          });
          // Start a new container.
          container.start(function(err) {
            if (err) {
              log.error("Can't start the container %s, error: %s", CIBuildContainerName, err);
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
              log.error('Output from %s container is empty with exit code %d', CIBuildContainerName, data.StatusCode);
              // @todo: We used to reject here, but it caused many false
              // positives.
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
        // Remove the container along with its volumes.
        'force': true,
        'v': true
      };
      // Start deleting every container.
      containers.forEach(function(container, index) {
        container.remove(opts, function(err, data) {
          if (err) {
            log.error('Can\'t delete the container %d', container.id);
            return reject(err);
          }

          log.info('The container %s removed', container.id);

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
