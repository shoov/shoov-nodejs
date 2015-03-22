var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var exec = require('child-process-promise').exec;

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
  var command = 'docker run -i amitaibu/shuv-pr /home/main.sh MAfHsk04NPMmt1Thhx3ngkkszfTWr5aUJXU7tOOlki4 git@github.com:amitaibu/gizra-behat.git master new-one 46 LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQ0KTUlJRW9nSUJBQUtDQVFFQXlOSjk5N1pnclZ0azJ0QzhCY1RZSW5zZXhaZytkMFZZWmxZakpzQ2lwQjJwUXJXOA0KVU8wNTZtTGVWVURzUHJxOHhZZlAxcDc3UWltdjV4OGFvbjlEc210R0FIbDkvZWI3VU9tNklqaXlhSllEbVRMYw0KRjZNbXF2REp3R0owY1lHbGtqRkR6YytNY0hTaTlZYlFENVBHUFpreDFsa3JYYjJqcXBCQlZQWUQxVDhjMHVORA0KVUlTbHhwd0s3dTdFMndxd24vbW0vQ0x3YkNsNXdOL2N0aWRualo2cnFkRG5XaFB5YlNpMHE2SVVpZDJ3ZzIycg0KMWN0c1djeXlmdTVQR1JMN1N5cTBidzlQTkJKdGNQVE5Uazc1dnNNUUZOUnoxcm9hdU5wZzNZUUZQM0JmdVFObg0KSVdKaFI2MEx2MklhWGtHZXZKVjJUZGRMcy9yUDA4d0ZUS3M3T3dJREFRQUJBb0lCQUVyVjFjZEhtVU5BdVphcA0KRGtnQUVLTFl5cURMbVF1Tk5lSDgyMkNIakpRbjBYbGdpK3FFWEg2eGxUU2oydVdOWk9jZk14NUJaRlJGZ0oxYQ0KQSt6bUMrNGk5NVVac1ErNjBaQlhhTnR6MFZnVC93ZEo0cWFVVDhhSHNFY1c2Vm1hL0g0OENZNWFkM1U0b2JscA0KSVlPTWgrVlFmemZuUnJmS0FZRi8vRGlTN042NzJ2ck5IUTFEZUFOaWphVXNPVHU2UlA4UUNRTDMrT0JTRHVIRg0KU1REYWpzMVNTWEJUVGR4RjZLcVRYa09kaWdrSEpCVi9PVW1TMnRsVmtXdURWMnI3NFVYMzY1UnMvRkZ5QUpkMQ0KTHh3aFkxUjEvNTd5STIvenNwMVc3T25iVVh4cVlvVHhVZ3o0UFlQQ0NRQzcvTWFUeXpPRjRiWTNsTUFoVWE4Sw0KNWJyV0JIRUNnWUVBN0M3dWU3bEN2SG1QL1Juc25LaGZKSkxzNjUzUmlGc0kzNjBzZ2p4N3lIQ3FKcUgwVUZKWQ0KWjBXVkNUaW0vcnBUSGtkL0pwQm52VTFQUm4yUjJCdE1qZ3VCOFF6OWVyekgyUWc2L0MvUGtMN2tkUkh1QlZMbg0KK0VyTlJVMUlNZFpBNnlMR1RVUklEdm1ld2RTT0tsTUJVTUpWL1REYkZqRTB2TElFWlpveVByY0NnWUVBMmF3Rw0KejVNUEh4WmkyNnFaSS93S2tvNlp6WGl1YUZZY3hoQU5EU0tRajBrNG9FSG51R08xQ04vMkJ2M2Z3RG9TVTdYdQ0KdmpQc251ekpjL1hvRHh1WUlrMHJRSlNtekI0VlNYeWxDTzh5TStzZkhQRFBZekZxNjFoQXN2dTNvUmt2ZDNIeg0KVU5uZkJ6cjJNVHZZbU5NcUpiREd1WFB1NkVKSkd5aGJTb1UyWTUwQ2dZQXhjY0hMZFFWYm43ZGRMVWd6bzZ3SA0KWkJybFdLeTg5eEhzZ2J5SHAxSGlySE55a3dVcXE1S0dURExmTTFVQ2pzOUh6My8yK3RRODlTcGJmMzVBMTdZMw0KSm9HVmpUcWpyMUhIUmNuVGNjN3Fab3c5VmZ1V2Niek9aaHFESDZLMWpEMGEvTFMzQ0V4dGxpUitQNWxqa3V6Nw0Ka3pPZFJkVVgyRVZLRzVxQUNyL3FFUUtCZ0FvK09pUFNlOGV1dWdBMFN2aVNoN3pWMFE4R09zN1dIb3lEZk5tOQ0KWXFnYmZmcXNuMGJpQ2tiY295czVEeXB3a1NRM1Q0REwyTHF4MGRrUEhWaDRwL1FWUlkvSWJ3RHorWFIzMVJ4Uw0KaFQ1RU5qYWFibWZ3ajJON3g2K2tnTU9uOTcvYk1PUUJIS211Y0o5b2ZZelRnd3c3QVY4QXdhRlVYVFJWOWRYUA0KNXZ0UkFvR0FhYUkwRzc4NjFCTlB1SERlalRBMEorUVJPV0s4eDAzT1B4clNsSmxkbStSbGMzZmxmSzNiMzVMVA0KeWo0eHBJTnFNVDRpVCtpZDZZaEw2MEFxUk5EUXN1bUp0Q2VzdzZOcDcxMjZ6SGRkd2Uya08wUS9xeDV1RVJUYg0Ka3JxNmozbU16T3JDSS8rNSsyeVZkNXovaGI5aUlWR2lEcDBxaGJDUDBSVXQxcndFZWZrPQ0KLS0tLS1FTkQgUlNBIFBSSVZBVEUgS0VZLS0tLS0';
  return exec(command)
    .then(function (result) {
      var stdout = result.stdout;
      var stderr = result.stderr;
      console.log('stdout: ', stdout);
      console.log('stderr: ', stderr);
    })
    .fail(function (err) {
      console.error('ERROR: ', err);
    })
    .progress(function (childProcess) {
      console.log('childProcess.pid: ', childProcess.pid);
    });
}



module.exports = router;
