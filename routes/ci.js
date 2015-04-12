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
    .then(function(data) {
      // @todo: Add validation (i.e. exit code) to the docker bash.
      console.log('Docker done');
      // Set the build status to "done".
      options.form.status = 'done';
      return request(options);
    })
    .catch(function(err) {
      console.log(err);
      // Set the build status to "error".
      options.form.status = 'error';
      return request(options);
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


      var logs_opts = {
        follow: true,
        stdout: true,
        stderr: true,
        timestamps: true
      };

      container.logs(logs_opts, function(err, stream) {
        var string = '';

        stream.on('data',function(chunk){
          // Get the data from the terminal.
          string += chunk;
        });

        stream.on('end',function() {
          // Upload the result to the backend.
          console.log('final output ' + string);
        });
      });

      container.inspect(function(err, data) {
        console.log(data.State);
      });

      return resolve(data);
    });
  });

};


module.exports = router;
