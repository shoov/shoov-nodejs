var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var exec   = require('child_process').exec;
var request = Promise.promisify(require('request'));

/* GET users listing. */
router.get('/:buildId/:screenshotIds/:newBranch/:accessToken', function(req, res, next) {

  var buildId = req.params.buildId;
  var accessToken = req.params.accessToken;
  var options = {
    url: process.env.BACKEND_URL + '/api/builds/' + buildId,
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
      return execDocker(buildId, req.params.screenshotIds, req.params.newBranch, accessToken);
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

var execDocker = function(buildId, screenshotIds, newBranch, accessToken) {
  var cmd = 'docker run -e BACKEND_URL=' + process.env.BACKEND_URL + ' amitaibu/shoov-pr /home/main.sh ' + buildId + ' ' + ' ' + screenshotIds + ' ' + newBranch + ' ' + accessToken;

  console.log(cmd);

  return new Promise(function(resolve, reject) {
    exec(cmd, function(err, stdout) {
      if(err) {
        reject(err);
      }
      else {
        resolve(stdout.replace('\n', ''));
      }
    });
  });

  // docker run -e BACKEND_URL=http://10.0.0.4/shoov/www -it amitaibu/shoov-pr /home/main.sh 7 8 new-branch1 eUfNOkVaqD7-cIOLMpllhJP1MlSxuVRd5zSZTwm8iuY
};


module.exports = router;
