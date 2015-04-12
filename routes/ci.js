var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');
var Docker = require('dockerode');

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
    .then(function(log) {
      console.log('Build Success');
      // Set the build status to "done".
      options.form.log = log.toString();
      options.form.status = 'done';
      return request(options);
    })
    .catch(function(log) {
      // Set the build status to "error".
      options.form.log = log.toString();
      options.form.status = 'error';
      return request(options);
    })
    .then(function(response) {
      console.log(JSON.parse(response));
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
        timestamps: true
      };

      var logOutput = '';

      container.logs(logsPpts, function(err, stream) {

        stream.on('data',function(chunk){
          // Get the data from the terminal.
          logOutput += chunk;
        });
      });

      container.inspect(function(err, data) {
        // Update if build was ok, based on the exit code of the container.
        if (data.State.ExitCode === 0) {
          return resolve(logOutput);
        }
        else {
          return reject(logOutput);
        }
      });
    });
  });

};


module.exports = router;
