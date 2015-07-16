/*

 Abstract layer under bash script to convert ansi colors to html class.
 ansi2html should be installed on your system and be in PATH bins directories.
 To use this bash script system should have gawk installed.

 https://github.com/pixelb/scripts/blob/master/scripts/ansi2html.sh

 ls -l --color=always | ansi2html.sh > ls.html
 git show --color | ansi2html.sh > last_change.html

 */



module.exports = function(content) {

  var result = '';

  var stream = require('stream');
  var s = new stream.Readable();
  s.push(content);
  s.push(null);

  var spawn = require('child_process').spawn;
  var ansi2html = spawn('ansi2html.sh', []);

  ansi2html.stdout.on('data', function (data) {
    console.log(data.toString());
    //result += data.toString();
  });

  //ansi2html.stdout.on('end', function (data) {
  //  return result;
  //});

  //ansi2html.stderr.on('data', function (data) {
  //  console.log('stop');
  //});

  //ansi2html.on('close', function (code) {
  //  //console.log('child process exited with code ' + code);
  //});

  s.pipe(ansi2html.stdin);

  return result;
};
