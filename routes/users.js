var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var exec = require('promised-exec');

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('Requet accepted');

  invokeDocker().then(function() {
    console.log('done exec');
  });

});

/**
 * Invoke the docker instance.
 */
var invokeDocker = function() {
  var command = 'ls';
  return exec(command)
    .then(function (result) {
      var stdout = result.stdout;
      var stderr = result.stderr;
      console.log('stdout: ', stdout);
      console.log('stderr: ', stderr);
    })
    .catch(function (err) {
      console.error('ERROR: ', err);
    });
}



module.exports = router;
