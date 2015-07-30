var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var config = require('./lib/config')();
var logger = require('./lib/logger')(config);

var app = express();

// Views

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// Middlewares

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger.requestLogger);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Routers

app.use('/', require('./routes/index'));
app.use('/create_pr', require('./routes/create_pr')(config, logger));
app.use('/ci', require('./routes/ci')(config, logger));
app.use('/encrypt', require('./routes/encrypt')(config, logger));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers
app.use(logger.errorLogger);

module.exports = app;
