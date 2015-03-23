var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var Docker = require('dockerode');

/* GET users listing. */
router.get('/', function(req, res, next) {
  invokeDocker().then(function(data) {
    console.log('end');
    // console.log(data.State);
  });
  res.send('Requet accepted');
});

/**
 * Invoke the docker instance.
 */
var invokeDocker = function() {
   var docker = new Docker();

   var cmd = [
     '/home/main.sh',
     'MAfHsk04NPMmt1Thhx3ngkkszfTWr5aUJXU7tOOlki4',
     'git@github.com:amitaibu/gizra-behat.git',
     'master',
     'new-one',
     '46',
     process.env.REPO_SSH_KEY
   ];

   var deferred = Promise.pending();
   docker.createContainer({Image: 'amitaibu/shuv-pr', Cmd: cmd}, function (err, container) {

     container.attach({stream: true, stdout: true, stderr: true}, function (err, stream) {
       stream.pipe(process.stdout, {end: true});
       stream.on('end', function() {

         container.inspect(function (err, data) {
           deferred.fulfill(data);
         });
       });
     });

     container.start(function (err, data) {
       if (err) {
         console.log(err);
       }
     });

     var logs_opts = {
           follow: true,
           stdout: true,
           stderr: true,
           timestamps: true
         };

     container.logs(logs_opts, function(err, stream) {
       // stream.pipe(process.stdout);
     });

   });

  return deferred.promise;
}


module.exports = router;
