var assert = require("assert");
var http = require('http');
var app = require('../app');

var port = process.env.PORT || 9620;
var url = 'http://localhost:' + port;
app.set('port', port);

var server = http.createServer(app);

describe('Shoov NodeJS Server', function() {

  before(function () {
    server.listen(port);
  });

  it('should running', function(done) {
    http.get(url, function (res) {
      assert.equal(200, res.statusCode);
      done();
    });
  });

  it('should return an encrypted value', function(done) {
    done();
  });

  after(function () {
    server.close();
  });
});
