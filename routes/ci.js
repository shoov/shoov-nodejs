var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');
var ansi2html = require('ansi2html');

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
 * Execute Docker.
 *
 * @param buildId
 * @param screenshotIds
 * @param newBranch
 * @param accessToken
 * @returns {bluebird}
 */
var execDocker = function(buildId, accessToken) {
  var docker = new Docker();

  var image = 'amitaibu/php-ci';
  var cmd = [
    '/home/shoov/main.sh',
    buildId,
    accessToken
  ];

  var optsc = {
    'Env': 'BACKEND_URL=' + process.env.BACKEND_URL
  };

  return new Promise(function(resolve, reject) {
    docker.run(image, cmd, process.stdout, optsc, function (err, data, container) {
      if (err) {
        return reject(err);
      }

      var logsPpts = {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: false
      };

      var logOutput = '';

      var logPromise = new Promise(function(resolve, reject) {
        container.logs(logsPpts, function(err, stream) {
          stream.on('data',function(chunk) {
            // Get the data from the terminal.
            logOutput += chunk;
          });

          stream.on('end',function() {
            return resolve(logOutput);
          });
        });
      });

      var exitCodePromise = new Promise(function(resolve, reject) {
        container.inspect(function(err, data) {
          return resolve(data.State.ExitCode);
        });
      });

      Promise.props({
        log: logPromise,
        exitCode: exitCodePromise
      })
        .then(function(result) {
          // Remove the container.
          container.remove(function(err, data) {});
          return resolve(result);
        });

    });
  });

};


module.exports = router;
