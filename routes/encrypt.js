var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var algorithm = 'aes-256-ctr';

router.post('/', function(req, res, next) {
  var privateKey = req.body.privateKey;
  var keyToConvert = req.body.keyToConvert;
  var valueToConvert = req.body.valueToConvert;

  var encryptResult = encrypt(keyToConvert + ':' + valueToConvert, privateKey);

  res.json({encrypt: encryptResult});
});

function encrypt(text, privateKey){
  var cipher = crypto.createCipher(algorithm, privateKey);
  var crypted = cipher.update(text,'utf8','hex');
  crypted += cipher.final('hex');
  return crypted;
}

module.exports = router;
