/*
 * Code Review routes:
 *
 *   /cr/:id?
 *
 */

var async = require('async');
var fs = require('fs');

function CodeReviewManager(redis, storepath) {
  if (!redis)
    throw new Error('need a redis connection');
  if (!storepath)
    throw new Error('need a store path');
  this._redis = redis;
  this._storepath = storepath;
}

function createUpload(username, callback) {
  var _this = this;
  var cr = { username: username };
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
    function(next) {
      // create directory in filesystem
      // XXX use node path routines
      cr.dir = _this._storepath + '/' + uplnum;
      fs.mkdir(cr.dir, 0700, next);
    },
    function(next) {
      // update database
      _this._redis.hmset(rkey, cr, next);
    }
  ],
    function(err) {
      if (err) {
        callback(error);
      } else {
        callback(null, cr);
      }
    }
  );
}

exports.get = function crmgr_get(req, res, next) {
  if (req.params.id) {
    res.render('review_detail', { title: 'Review #' + req.params.id });
  } else {
    res.render('review_list', { title: 'Browse Reviews' });
  }
}

exports.post = function crmgr_post(req, res, next) {
}

exports.CodeReviewManager = CodeReviewManager;
exports.CodeReviewManager.prototype.createUpload = createUpload;
