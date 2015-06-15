var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');
var util = require('util');

var debug = process.env.DEBUG || false;

var fs = require('fs');
var logs_dir = __dirname + '/../logs/';

// Setup log system.
var winston = require('winston');
require('winston-loggly');

var logger = new(winston.Logger)({
  transports: [
    new(winston.transports.Console)({
      colorize: 'all',
      timestamp: true,
      level: (debug) ? 'debug' : 'error'
    }),
    new(winston.transports.Loggly)({
      inputToken: process.env.LOGGLY_TOKEN,
      subdomain: 'gizra',
      tags: ['shoov-nodejs'],
      json: true
    })
  ]
});

// Invoke a PR.
router.get('/:buildItemId/:accessToken', function(req, res, next) {
  var buildItemId = req.params.buildItemId;
  var accessToken = req.params.accessToken;

  logger.info('Request received for CI Build Item ID %d', buildItemId);

  var options = {
    url: process.env.BACKEND_URL + '/api/ci-build-items/' + buildItemId,
    method: 'PATCH',
    qs: {
      access_token: accessToken
    },
    form: {
      status: 'in_progress'
    }
  };

  // Set the build status to "in progress".
  request(options)
    .then(function(response) {
      var data = JSON.parse(response).data[0];
      return execDocker(data.build, buildItemId, accessToken);
    })
    .then(function(response) {
      // Convert ANSI colors to HTML.
      options.form.log = ansi2html(response.log);
      // Set the build status to "done" or "error" by the exit code.
      options.form.status = !response.exitCode ? 'done' : 'error';
      return request(options);
    })
    .then(function(response) {
      var json = JSON.parse(response);
      if (json.data) {
        logger.info('Build Item Id %d is finished and data uploaded to backend.', buildItemId);
      }
      else {
        logger.error('Response from backend is invalid.', { response: response });
      }
    })
    .catch(function(err) {
      logger.error('Error while work on CI Build Item Id %d', buildItemId, { message: err.message });
    });

  res.json( { message: 'Request accepted' } );
});

/**
 * Execute all dockers containers.
 *
 * @param buildId
 *  ID of CI Build on the backend.
 * @param accessToken
 *  Access token of user creator of CI Build.
 *
 * @returns {Promise}
 */
var execDocker = function(buildId, buildItemId, accessToken) {
  // Init a docker object.
  var docker = new Docker();
  // All running containers.
  var containers = [];
  // Generate unique name for containers.
  var CIBuildContainerName = 'ci-build-' + buildItemId;
  var sileniumContainerName = 'silenium-' + buildItemId;
  // Determine a VNC password.
  var vncPassword = process.env.VNC_PASSOWRD || 'hola';
  var timeoutLimit = process.env.TIMEOUT_LIMIT || 30;
  var uptimeLimit = process.env.UPTIME_LIMIT || 20;
  // Indicate of containers were already processed for remove.
  var removedContainers = false;

  /**
   * Function creates and starts Silenium container.
   *
   * @returns {Promise}
   */
  var runSilenium = function() {
    logger.info('Start %s', sileniumContainerName);

    return new Promise(function(resolve, reject) {
      // Determine if the container is ready, and can accept connections.
      var containerReady = false;

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
          logger.error('Can\'t create the container %s', sileniumContainerName);
          reject(new Error(err));
          console.log('balalaylka');
          return;
        }
        // Attach to container.
        container.attach({logs: true, stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            logger.error('Can\'t attach to the container %s', sileniumContainerName);
            reject(err);
          }
          // Save container in containers variable.
          containers.push(container);

          logger.debug('%s container ID is %s', sileniumContainerName, container.id);

          // Debug container output.
          if (debug) {
            stream.pipe(fs.createWriteStream(logs_dir + sileniumContainerName + '.log', { encoding: 'utf8' }));
          }
          // Start a new created container.
          container.start(function(err) {
            if (err) {
              logger.error('Can\'t start the container %s', sileniumContainerName);
              reject(err);
            }
            // Set timeout for the time for which the silenium server should start.
            setTimeout(function() {
              if (!containerReady) {
                reject(util.format('%s couldn\'t start, and have timed out after %d sec', sileniumContainerName, timeoutLimit));
              }
            }, timeoutLimit * 1000);
            // Set timeout for the maximum uptime.
            setTimeout(function() {
              var err = new Error(util.format('Uptime for %s is overtime.', sileniumContainerName));
              reject(err);
            }, uptimeLimit * 60 * 1000);
          });
          // Read stream and wait until needed phrase.
          stream.on('data', function(chunk) {
            // And waiting for "Ready" string.
            var string = chunk.toString();
            if (string.indexOf('all done and ready for testing') > -1) {
              containerReady = true;
              logger.info('%s is ready!', sileniumContainerName);
              resolve(true);
            }
          });
        });
      });
    });
  };

  /**
   * Function creates and starts CI Build container.
   *
   * @returns {Promise}
   */
  var runCIBuild = function() {
    logger.info('Start %s', CIBuildContainerName);

    return new Promise(function(resolve, reject) {
      // Result for save all output logs and exit code.
      var result = {
        log: '',
        exitCode: 0
      };

      docker.createContainer({
        'Image': 'amitaibu/php-ci',
        'Env': [
          'BACKEND_URL=' + process.env.BACKEND_URL
        ],
        'Cmd': [
          '/home/shoov/main.sh',
          buildId,
          accessToken
        ],
        'HostConfig': {
          "Links": [sileniumContainerName + ':silenium']
        },
        'name': CIBuildContainerName
      }, function(err, container) {
        if (err) {
          logger.error('Can\'t create the container %s', CIBuildContainerName);
          reject(err);
        }
        // Attach to container.
        container.attach({logs: true, stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) {
            logger.error('Can\'t attach to the container %s', CIBuildContainerName);
            reject(err);
          }
          // Save container in containers variable.
          containers.push(container);

          logger.debug('%s container ID is %s', CIBuildContainerName, container.id);

          // Debug container output.
          if (debug) {
            stream.pipe(fs.createWriteStream(logs_dir + CIBuildContainerName + '.log', { encoding: 'utf8' }));
          }
          // Read a stream.
          stream.on('data', function(chunk) {
            // Get the data from the terminal.
            result.log += chunk;
          });
          // Start a new created container.
          container.start(function(err) {
            if (err) {
              logger.error('Can\'t start the container ', CIBuildContainerName);
              reject(err);
            }
            // Set timeout for the maximum uptime.
            setTimeout(function() {
              var errMsg = util.format('Uptime for %s is overtime.', CIBuildContainerName);
              logger.error(errMsg);
              reject(new Error(errMsg));
            }, uptimeLimit * 60 * 1000);
          });
          // Waits for a container to end.
          container.wait(function(err, data) {
            if (err) {
              logger.error('Error while the container %s is finished.', CIBuildContainerName);
              reject(err);
            }

            logger.info('%s container is finished.', CIBuildContainerName);

            // TODO: Figure out why it's happened.
            if (!result.log) {
              var errMsg = util.format('Output from %s container is empty', CIBuildContainerName);
              logger.error(errMsg);
              reject(new Error(errMsg));
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
            logger.error('Can\'t delete the container %d', container.id);
            reject(err);
          }

          logger.debug('The container %s removed', container.id);

          removedContainers++;
          // If all containers are removed we can return.
          if (removedContainers >= countContainers) {
            resolve(true)
          }
        })
      });
    });
  };

  // Helper variable to get the CI container logs.
  var returnOutput = '';

  // Start a promise chain.
  return runSilenium()
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
      logger.error('Error while executing docker containers.', { message: err.message });
    });

};

module.exports = router;
