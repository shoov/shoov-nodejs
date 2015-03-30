var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var exec   = require('child_process').exec;

/* GET users listing. */
router.get('/:buildId/:screenshotIds/:newBranch/:accessToken', function(req, res, next) {


  execDocker(req.params.buildId, req.params.screenshotIds, req.params.newBranch, req.params.accessToken)
    .then(function(data) {
        console.log(data);
    });
  res.send('Request accepted');
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
