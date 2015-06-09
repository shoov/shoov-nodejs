var express = require('express');
var router = express.Router();
var Promise = require('bluebird');
var request = require('request-promise');

router.get('/:privateKey/:keyToConvert/:valueToConvert', function(req, res, next) {

  var privateKey = req.params.privateKey;
  var keyToConvert = req.params.keyToConvert;
  var valueToConvert = req.params.valueToConvert;

  var encryptResult = encrypt(keyToConvert + ':' + valueToConvert, privateKey);

  res.json({encrypt: encryptResult});
});

var crypto = require('crypto');
var algorithm = 'aes-256-ctr';

function encrypt(text, privateKey){
  var cipher = crypto.createCipher(algorithm, privateKey)
  var crypted = cipher.update(text,'utf8','hex')
  crypted += cipher.final('hex');
  return crypted;
}

module.exports = router;
