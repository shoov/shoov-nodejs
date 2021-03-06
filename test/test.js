var assert = require("assert");
var http = require('http');
var request = require('request');
var app = require('../app');

var port = process.env.PORT || 9620;
var url = 'http://localhost:' + port;
app.set('port', port);

var server = http.createServer(app);

describe('Shoov NodeJS Server', function() {

  before(function () {
    server.listen(port);
  });

  it('should be running', function(done) {
    http.get(url, function (res) {
      assert.equal(200, res.statusCode);
      done();
    });
  });

  it('should return an encrypted value', function(done) {
    var options = {
      privateKey: 'Y2DCJ6zGnVvZamcusAuNs1HfC-4AqDU46rvMgRAclSM',
      keyToConvert: 'foo',
      valueToConvert: 'bar'
    };
    request.post({url: url + '/encrypt', form: options}, function(err, httpResponse, body) {
      if (err) throw err;
      assert.equal("d06da7a9e66314", JSON.parse(body).encrypt);
      done();
    });
  });

  after(function () {
    server.close();
  });
});
