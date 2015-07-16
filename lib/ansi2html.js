/*

 Abstract layer under bash script to convert ansi colors to html class.
 ansi2html should be installed on your system and be in PATH bins directories.
 To use this bash script system should have gawk installed.

 https://github.com/pixelb/scripts/blob/master/scripts/ansi2html.sh

 ls -l --color=always | ansi2html.sh > ls.html
 git show --color | ansi2html.sh > last_change.html

 */

module.exports = function(content, callback) {
  var result = '';

  // Convert string to stream.
  var stream = require('stream');
  var s = new stream.Readable();
  s.push(content);
  s.push(null);

  // Spawn child process.
  var spawn = require('child_process').spawn;
  var ansi2html = spawn('ansi2html.sh', []);

  ansi2html.stdout.on('data', function (data) {
    result += data.toString();
  });

  ansi2html.on('close', function (code) {
    // Filter all result except content of pre tags.
    // TODO: omg, fix me;
    var start = result.indexOf("<pre>") + 6;
    var end = result.indexOf("</pre>") - start - 1;
    var filtered_result = result.substr(start, end);

    callback(filtered_result);
  });

  s.pipe(ansi2html.stdin);
};
