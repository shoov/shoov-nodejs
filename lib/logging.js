var winston = require('winston');
var expressWinston = require('express-winston');
require('winston-loggly');

module.exports = function() {

  var winstonTransports = [
    new winston.transports.Console({
      json: false,
      timestamp: true,
      colorize: 'all'
    })
  ];

  if (process.env.LOGGLY_TOKEN && process.env.LOGGLY_SUBDOMAIN) {
    logglyTransport = new(winston.transports.Loggly)({
      inputToken: process.env.LOGGLY_TOKEN,
      subdomain: process.env.LOGGLY_SUBDOMAIN,
      tags: ['shoov-nodejs', 'express'],
      json: true
    });

    winstonTransports.push(logglyTransport);
  }

  var requestLogger = expressWinston.logger({
    transports: winstonTransports,
    expressFormat: true
  });

  var errorLogger = expressWinston.errorLogger({
    transports: winstonTransports
  });

  return {
    requestLogger: requestLogger,
    errorLogger: errorLogger
  };

};
