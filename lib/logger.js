var winston = require('winston');
var expressWinston = require('express-winston');
require('winston-loggly');

module.exports = function(config) {

  // Setup transports.
  var winstonTransports = {
    transports: [
      new(winston.transports.Console)({
        json: false,
        timestamp: true,
        colorize: 'all',
        level: config.get('debug') ? 'debug' : 'info'
      })
    ]
  };

  if (config.get('loggly_token') && config.get('loggly_subdomain')) {
    logglyTransport = new(winston.transports.Loggly)({
      inputToken: config.get('loggly_token'),
      subdomain: config.get('loggly_subdomain'),
      tags: ['shoov-nodejs', 'express'],
      json: true
    });

    winstonTransports.transports.push(logglyTransport);
  }

  // Init a logger.
  var log = new(winston.Logger)(winstonTransports);
  log.addRewriter(function(level, msg, meta) {
    // Do not modify debug level.
    if (level === 'debug') {
      // Debug level isn't uploaded to Loggly.
      return;
    }

    meta.uuid = config.get('loggly_uuid');
    return meta;
  });

  // Middlewares for express.
  var requestLogger = expressWinston.logger({
    winstonInstance: log,
    expressFormat: true
  });

  var errorLogger = expressWinston.errorLogger({
    winstonInstance: log
  });
  
  return {
    requestLogger: requestLogger,
    errorLogger: errorLogger,
    error: log.error,
    warn: log.warn,
    info: log.info,
    log: log.log,
    verbose: log.verbose,
    debug: log.debug,
    silly: log.silly
  };

};
