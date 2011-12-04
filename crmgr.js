/*
 * Code Review routes:
 *
 *   /cr/:id?
 *
 */

var async = require('async');
var fs = require('fs');
var archiver = require('./archiver');
var path = require('path');

function CodeReviewManager(redis, storepath) {
  var _this = this;
  if (!redis)
    throw new Error('need a redis connection');
  if (!storepath)
    throw new Error('need a store path');
  this._redis = redis;
  this._storepath = storepath;
  this.get_new = function(req, res, next) {
    return crmgr_get_new(_this, req, res, next);
  }
  this.get = function(req, res, next) {
    return crmgr_get(_this, req, res, next);
  }
  this.post = function(req, res, next) {
    return crmgr_post(_this, req, res, next);
  }
}

function createReview(username, description, archiveFile, callback) {
  var _this = this;
  var cr = { bad: true, owner: username, description: description };
  var rkey;
  async.waterfall([
    function(next) {
      // get ID from redis
      _this._redis.incr("illumos:cr:next_upload_number", next);
    },
    function(uplnum, next) {
      rkey = 'illumos:cr:review:' + uplnum;
      cr.upload_number = uplnum;
      // store prelim information in database
      // XXX should wrap DEL + HMSET in MULTI/EXEC to be sure?
      _this._redis.hmset(rkey, cr, next);
    },
    function(res, next) {
      // create directory in filesystem
      cr.dir = path.join(_this._storepath, String(cr.upload_number));
      fs.mkdir(cr.dir, 0755, next);
    },
    function(next) {
      // update database
      _this._redis.hmset(rkey, cr, next);
    },
    function(res, next) {
      // extract uploaded file
      archiver.extractFile(archiveFile, cr.dir, next);
    },
    function(next) {
      // mark review as GOOD in database
      _this._redis.hdel(rkey, 'bad', next);
    }
  ],
    function(err) {
      if (err) {
        callback(err);
      } else {
        callback(null, cr);
      }
    }
  );
}

function crmgr_get_new(_this, req, res, next) {
  res.render('review_form', { title: 'Upload a New Review' });
}

function crmgr_get(_this, req, res, next) {
  if (req.params.id) {
    res.render('review_detail', { title: 'Review #' + req.params.id });
  } else {
    res.render('review_list', { title: 'Browse Reviews' });
  }
}

function crmgr_post(_this, req, res, next) {
  if (req.body.webrev && req.body.description) {
    _this.createReview(req.session.user.uid, req.body.description, req.body.webrev.path,
    function(err, cr) {
      fs.unlink(req.body.webrev.path); // don't need *this* anymore
      if (err) {
        console.log('ERROR: ' + err.message);
      }
      res.redirect('/cr');
    });
  } else {
    res.redirect('/cr/new');
  }
}

exports.CodeReviewManager = CodeReviewManager;
exports.CodeReviewManager.prototype.createReview = createReview;
