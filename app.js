var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var async = require('async');

var Bolt = require('misfit-bolt');

var index = require('./routes/index');
var users = require('./routes/users');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', index);
app.use('/users', users);

app.get(`/:id`, (request, response) => {
  const id = request.params.id,
        bolt = Bolt.get(id);

  console.log(`Getting ${bolt.id} values`);
  async.series([
    (done) => { bolt.getRGBA(done); },
    (done) => { bolt.getHSB(done); },
    (done) => { bolt.getState(done); }
  ], (error, values) => {
    console.log(`Got ${bolt.id} values: ${values}`);
    if (error) {
      errorHandler(error, response);
    } else {
      response.send({
        id: bolt.id,
        red: values[0][0],
        green: values[0][1],
        blue: values[0][2],
        alpha: values[0][3],
        hue: values[1][0],
        saturation: values[1][1],
        brightness: values[1][2],
        state: values[2]
      });
    }
  });
});

app.patch(`/:id`, (request, response) => {
  var tasks = [];

  try {
    const id = request.params.id,
          bolt = Bolt.get(id);

    console.log(`Setting ${id} values`);

    [
      'red',
      'green',
      'blue',
      'alpha',
      'hue',
      'saturation',
      'brightness',
      'state'
    ].forEach((property) => {
      const value = request.body[property];
      if (value !== undefined) {
        ((value) => {
          tasks.push((done) => {
            const ucfirst = property.charAt(0).toUpperCase() + property.slice(1);
            const method = `set${ucfirst}`;
            console.log(`${id}#${method} called with "${value}"`);
            bolt[method](value, done);
          });
        })(value);
      }
    });

    async.parallel(tasks, function(error) {
      if (error) {
        console.log(error.message);
      }
      response.status(204).end();
    });
  } catch (err) {
    console.log(err);
  }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

Bolt.init();

module.exports = app;
