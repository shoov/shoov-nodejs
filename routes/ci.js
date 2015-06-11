var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');

var backendUrl = process.env.BACKEND_URL || "http://192.168.1.32/shoov.local/";
var debug = true;

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
 * Execute Silenium plus CI Build docker.
 *
 * @param buildId
 *  ID of CI Build on the backend.
 * @param accessToken
 *  Access token of user creator of CI Build.
 *
 * @returns {bluebird}
 */
var execDocker = function(buildId, accessToken) {
  // Init a docker.
  var docker = new Docker({socketPath: '/var/run/docker.sock'});

  // Variable contain all created containers.
  var containers = [];

  // Function create and run Silenium container.
  var runSilenium = function() {
    return new Promise(function(resolve, reject) {
      docker.createContainer({
        'Image': 'elgalu/selenium:v2.45.0-oracle1',
        'Env': [
          'SCREEN_WIDTH=1920',
          'SCREEN_HEIGHT=1080',
          'VNC_PASSWORD=hola',
          'WITH_GUACAMOLE=false',
        ]
      }, function(err, container) {
        if (err) reject(err);
        // Save container in containers variable.
        containers.push(container);
        // Start a new created container.
        container.start(function(err) {
          if (err) reject(err);
          // TODO: output logs to stdout.
          // Inspect a new started container.
          container.inspect(function(err, data) {
            if (err) reject(err);
            // Return ID of the new container.
            resolve(data.Name);
          });
        });
      });
    });
  };

  // Function create and run CI Build container.
  var runCIBuild = function(sileniumContainerName) {
    var result = {};

    return new Promise(function(resolve, reject) {
      docker.createContainer({
        'Image': 'amitaibu/php-ci',
        'Env': [
          'BACKEND_URL=' + backendUrl
        ],
        'Cmd': [
          '/home/shoov/main.sh',
          buildId,
          accessToken
        ],
        'HostConfig': {
          "Links": [sileniumContainerName + ':silenium']
        }
      }, function(err, container) {
        if (err) reject(err);
        // Save container in containers variable.
        containers.push(container);
        // Attach to container.
        container.attach({stream: true, stdout: true, stderr: true}, function(err, stream) {
          if (err) reject(err);
          // Debug app.
          if (debug) stream.pipe(process.stdout);
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
            // Set exit code.
            result.exitCode = data.StatusCode;
            // Return result.
            resolve(result);
          });
        });
      });
    });
  };

  // Function to remove all containers.
  var removeContainers = function() {
    return new Promise(function(resolve, reject) {
      // We are need next variables to solve async issue.
      var countContainers = containers.length;
      var removedContainers = 0;
      // Some options for remove command.
      var opts = {
        'force': true // Kill then remove the container.
      };
      // Start deleting every container.
      containers.forEach(function(container, index) {
        container.remove(opts, function(err, data) {
          // Happening something bad.
          if (err) reject(err);
          // Plus counter of removed containers.
          removedContainers++;
          // If all containers are removed we can return.
          if (removedContainers >= countContainers) {
            resolve('All containers are removed.');
          }
        })
      });
    });
  };

  return runSilenium()
    .then(runCIBuild)
    .then(removeContainers)
    .then(console.log);

};

module.exports = router;
