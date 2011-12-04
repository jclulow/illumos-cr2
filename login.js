/*
 * login.js: authentication handling
 *    (for illumos-cr2)
 *
 *   Copyright 2011 Joshua M. Clulow <josh@sysmgr.org>
 */

var util = require('util');
var async = require('async');
var crypto = require('crypto');

var getUserObject = null;

var redisClient = null;
function setRedisClient(rc) {
  redisClient = rc;
  getUserObject = getUserObjectRedis;
}

var postgresClient = null;
function setPostgresClient(pg) {
  postgresClient = pg;
  getUserObject = getUserObjectPostgres;
}

function shasum(str) {
  var sha = crypto.createHash('sha1');
  sha.update(str);
  return (sha.digest('hex'));
}

function enforceLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    /*
     * try and save the URL we were originally
     * trying to get to, so that we can forward the
     * browser there after a successful login.
     */
    req.session.url_after_login = req.url;
    res.redirect('/login');
  }
}

function handleLoginGet(req, res, next) {
  var opts = { title: 'Sign In' };
  if (req.session.loginerror)
    opts.loginerror = req.session.loginerror;
  res.render('login', opts);
}

function getUserObjectRedis(username, cb) {
  redisClient.hgetall('illumos:user:' + username, cb);
}

function getUserObjectPostgres(username, cb) {
  var qs = 
    'SELECT ' +
    '  login AS uid, ' +
    '  hashed_password AS password, ' +
    '  firstname || \' \' || lastname AS cn, ' +
    '  mail, ' +
    '  status ' +
    'FROM users ' +
    'WHERE login = $1 ';
  postgresClient.query(qs, [username], function(err, res) {
    if (err) {
      cb(err);
    } else if (result.rows.length === 1) {
      cb(null, result.rows[0]);
    } else {
      cb(new Error('could not find single user: ' + username));
    }
  });
}

function handleLogin(req, res, next) {
  console.log('POST /login: ' + util.inspect(req.body));
  var username = req.body.top_user || req.body.login_user;
  var password = req.body.top_pass || req.body.login_pass;
  if (username && password) {
    getUserObject(username, function(err, obj) {
      if (err) {
        console.log('error: ' + util.inspect(err));
        req.session.loginerror = 'Sorry, please try again!';
        res.redirect('/login');
      } else {
        console.log('user: ' + util.inspect(obj));
        if (shasum(password) === obj.password) {
          delete obj.password;
          req.session.user = obj;
          if (req.session.url_after_login) {
            res.redirect(req.session.url_after_login);
          } else {
            res.redirect('/');
          }
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

function handleLogout(req, res, next) {
  console.log('GET /logout');
  req.session.destroy();
  return (res.redirect('/'));
}

/*
 * the api
 */

exports.post = handleLogin;
exports.get = handleLoginGet;
exports.logout = handleLogout;
exports.enforce = enforceLogin;
exports.setRedisClient = setRedisClient;
exports.setPostgresClient = setPostgresClient;
