
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

var rc = redis.createClient();

var crmgr = require('./crmgr');

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
    app.get('/', routes.index);
    app.get('/cr/:id?', crmgr.get);
    app.post('/cr/new', crmgr.post);
    app.get('/login', handle_login_get);
    app.post('/login', handle_login);
    app.get('/logout', handle_logout);
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

function local_populator(req, res, next) {
	var links = [];
	res.local('links', [
		{ active: true, path: '/cr', title: 'Browse Reviews' },
		{ active: false, path: '/my/cr', title: 'My Reviews' },
		{ active: false, path: '/cr/new', title: 'New Review' }
	]);
	if (req.session && req.session.user)
		res.local('user', req.session.user);
	else
		res.local('user', {});
	res.local('title', "XXX DEFAULT TITLE");
	next();
}

function shasum(str) {
	var sha = crypto.createHash('sha1');
	sha.update(str);
	return (sha.digest('hex'));
}

function handle_login_get(req, res, next) {
	var opts = { title: 'Sign In' };
	if (req.session.loginerror)
		opts.loginerror = req.session.loginerror;
	res.render('login', opts);
}

function handle_login(req, res, next) {
	console.log("POST /login: " + util.inspect(req.body));
	var username = req.body.top_user || req.body.login_user;
	var password = req.body.top_pass || req.body.login_pass;
	if (username && password) {
		rc.hgetall('illumos:user:' + username, function (err, obj) {
			if (err) {
				console.log("error: " + util.inspect(err));
				req.session.loginerror = 'Sorry, please try again!';
				res.redirect('/login');
			} else {
				console.log("user: " + util.inspect(obj));
				if (shasum(password) === obj.password) {
					delete obj.password;
					req.session.user = obj;
					res.redirect('/');
					//res.render('user', { title: 'User', user: obj });
				} else {
					req.session.loginerror = 'Sorry, please try again!';
					res.redirect('/login');
				}
			}
		});
	} else {
		req.session.loginerror = 'Sorry, you must enter a username and password!';
		res.redirect('/login');
	}
}

function handle_logout(req, res, next) {
	console.log('GET /logout');
	req.session.destroy();
	return (res.redirect('/'));
}
