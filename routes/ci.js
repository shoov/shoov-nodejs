var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = Promise.promisify(require('request'));
var Docker = require('dockerode');

// Invoke a PR.
router.get('/:buildId/:accessToken', function(req, res, next) {

  var buildId = req.params.buildId;
  var accessToken = req.params.accessToken;
  var options = {
    url: process.env.BACKEND_URL + '/api/ci-builds/' + buildId,
    method: 'PATCH',
    qs: {
      access_token: accessToken
    },
    form: {
      pull_request_status: 'in_progress'
    }
  };

  // Set the build status to "in progress".
  request(options)
    .then(function(response) {
      return execDocker(buildId, accessToken);
    })
    .then(function(data) {
      // @todo: Add validation (i.e. exit code) to the docker bash.
      console.log('Docker done');
      // Set the build status to "done".
      options.form.pull_request_status = 'done';
      return request(options);
    })
    .catch(function(err) {
      console.log(err);
      // Set the build status to "error".
      options.form.pull_request_status = 'error';
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

      return resolve(data);
    });
  });

};


module.exports = router;
