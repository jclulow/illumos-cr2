
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
/*var config = require('express-configure');*/
var redis = require('redis');
var crypto = require('crypto');
var util = require('util');
var async = require('async');
var RedisStore = require('connect-redis')(express);
var crmgr = require('./crmgr');
var login = require('./login');

// Init

var rc = redis.createClient();
login.setRedisClient(rc);
var app = module.exports = express.createServer();

// Configuration

async.waterfall([
  function(next) {
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser());
    next();
  },
  function(next) {
    // select redis database
    rc.select(0, next);
  },
  function(obj, next) {
    // request settings hash from redis
    rc.hgetall('illumos:cr:settings', next);
  },
  function(obj, next) {
    for (key in obj) {
      if (obj.hasOwnProperty(key)) {
        var val = obj[key];
        if (val === 'true') {
          val = true;
        } else if (val === 'false') {
          val = false;
        } else if (!isNaN(val)) {
          val = Number(val);
	}
        console.log('setting [ ' + key + ' ] = ' + util.inspect(val));
        app.set(key, obj[key]);
      }
    }
    app.use(express.session({
      secret: app.settings.session_secret,
      store: new RedisStore()
    }));
    app.use(app.router);
    app.use(express.static(__dirname + '/public'));
    if (app.settings.show_errors) {
      app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
    } else {
      app.use(express.errorHandler());
    }
    /* pre-initialise locals for template: */
    app.all('*', local_populator);
    /* application routes: */
    app.get('/', function(req, res) { res.redirect('/cr'); });
    app.get('/cr/new', login.enforce, crmgr.get_new);
    app.get('/cr/:id?', crmgr.get);
    app.post('/cr/new', login.enforce, crmgr.post);
    /* login hooks */
    app.get('/login', login.get);
    app.post('/login', login.post);
    app.get('/logout', login.logout);
    next();
  }],
  // error handler / final callback:
  function last(err) {
    if (err) {
      console.log("STARTUP ERROR: " + util.inspect(err));
      process.exit(1);
    } else {
      console.log("LISTENING ON PORT: " + app.settings.port);
      app.listen(app.settings.port);
    }
  }
);

// Routes

/*
 * pre-populate some variables that we use in the base
 *  layout template.  they can be overridden by more specific
 *  code later.
 */
function local_populator(req, res, next) {
	var links = [];
	res.local('links', [
		{ active: true, path: '/cr', title: 'Browse Reviews' },
		/* { active: false, path: '/my/cr', title: 'My Reviews' },
		{ active: false, path: '/cr/new', title: 'New Review' } */
	]);
	if (req.session && req.session.user)
		res.local('user', req.session.user);
	else
		res.local('user', {});
	res.local('title', "XXX DEFAULT TITLE");
	next();
}
