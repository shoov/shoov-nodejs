var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');

var debug = process.env.DEBUG || false;

// Invoke a PR.
router.get('/:buildItemId/:accessToken', function(req, res, next) {

  var buildItemId = req.params.buildItemId;
  var accessToken = req.params.accessToken;
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
      return execDocker(data.build, accessToken);
    })
    .then(function(response) {
      // Convert ANSI colors to HTML.
      options.form.log = ansi2html(response.log);
      // Set the build status to "done" or "error" by the exit code.
      options.form.status = !response.exitCode ? 'done' : 'error';
      return request(options);
    })
    .then(function(response) {
      console.log(JSON.parse(response));
    })
    .catch(function(err) {
      console.log(err);
    });

  res.json({message: 'Request accepted'});
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
var execDocker = function(buildId, accessToken) {
  // Init a docker object.
  var docker = new Docker();
  // All running containers.
  var containers = [];
  // Generate unique name for containers.
  var CIBuildContainerName = 'ci-build-' + buildId;
  var sileniumContainerName = 'silenium-' + buildId;
  // Determine a VNC password.
  var vncPassword = process.env.VNC_PASSOWRD || 'hola';
  var timeoutLimit = process.env.TIMEOUT_LIMIT || 30;
  // Indicate of containers were already processed for remove.
  var removedContainers = false;

  /**
   * Function creates and starts Silenium container.
   *
   * @returns {Promise}
   */
  var runSilenium = function() {
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
        if (err) reject(err);
        // Save container in containers variable.
        containers.push(container);
        // Attach to container.
        container.attach({stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) reject(err);
          // Debug container output.
          if (debug) {
            stream.pipe(process.stdout);
          }
          // Start a new created container.
          container.start(function(err) {
            if (err) reject(err);
            // Set timeout.
            setTimeout(function() {
              if (!containerReady) {
                reject('Silenium server couldn\'t start, and have timed out after ' + timeoutLimit + ' sec');
              }
            }, timeoutLimit * 1000);
          });
          // Read stream and wait until needed phrase.
          stream.on('data', function(chunk) {
            // And waiting for "Ready" string.
            var string = chunk.toString();
            if (string.indexOf('all done and ready for testing') > -1) {
              containerReady = true;
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
    return new Promise(function(resolve, reject) {
      // Result for save all output logs and exit code.
      var result = {};

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
        if (err) reject(err);
        // Save container in containers variable.
        containers.push(container);
        // Attach to container.
        container.attach({stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) reject(err);
          // Debug container output.
          if (debug) {
            stream.pipe(process.stdout);
          }
          // Read a stream.
          stream.on('data', function(chunk) {
            // Get the data from the terminal.
            result.log += chunk;
          });
          // Start a new created container.
          container.start(function(err) {
            if (err) reject(err);
          });
          // Waits for a container to end.
          container.wait(function(err, data) {
            if (err) reject(err);
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
          if (err) reject(err);
          removedContainers++;
          // If all containers are removed we can return.
          if (removedContainers >= countContainers) {
            resolve('Containers are stopped.')
          }
        })
      });
    });
  };

  // Helper variable to get the CI container logs.
  var returnOutput = undefined;

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
      console.log(err);
    });

};

module.exports = router;
