var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var algorithm = 'aes-256-ctr';

var conf = {};
var log = {};

module.exports = function(config, logger) {

  conf = config;
  log = logger;

  router.post('/', function(req, res, next) {
    var privateKey = req.body.privateKey;
    var keyToConvert = req.body.keyToConvert;
    var valueToConvert = req.body.valueToConvert;

    if (!privateKey) {
      throw new Error('No "privateKey" key provided.');
    }
    if (!keyToConvert) {
      throw new Error('No "keyToConvert" key provided.');
    }

    if (!valueToConvert) {
      throw new Error('No "valueToConvert" key provided.');
    }

    var encryptResult = encrypt(keyToConvert + ':' + valueToConvert, privateKey);

    log.info('Encrypt key: %s and value: %s', keyToConvert, valueToConvert);

    res.json({encrypt: encryptResult});
  });

  function encrypt(text, privateKey){
    var cipher = crypto.createCipher(algorithm, privateKey);
    var crypted = cipher.update(text,'utf8','hex');
    crypted += cipher.final('hex');
    return crypted;
  }

  return router;
};
