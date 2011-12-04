/*
 * archiver.js: extract zips, tarballs, etc
 *    (for illumos-cr2)
 *
 *   Copyright 2011 Joshua M. Clulow <josh@sysmgr.org>
 */

var child_process = require('child_process');
var spawn = child_process.spawn;
var execFile = child_process.execFile;
var async = require('async');

var PATTERNS = [
  { pat: /gzip compressed data/, type: 'gzip', stage: 'interim' },
  { pat: /bzip2 compressed data/, type: 'bzip2', stage: 'interim' },
  { pat: /[zZ][iI][pP] archive/, type: 'zip', stage: 'final' },
  { pat: /tar archive/, type: 'tar', stage: 'final' }
];
var ARCHIVE_TIMEOUT = 20;

function archiveType(path, callback) {
  var p = execFile('file', [path], function(err, stdout, stderr) {
    if (err) {
      return callback(err);
    } else {
      for (var i = 0; i < PATTERNS.length; i++) {
        var p = PATTERNS[i];
        if (stdout.match(p.pat)) {
          return callback(null, p);
        }
      }
      return callback(new Error('could not identify archive type'));
    }
  });
}

function extractZip(archfile, destpath, cb) {
  var opts = {
    cwd: destpath,
    timeout: ARCHIVE_TIMEOUT
  };
  var args = [ '-qq', archfile ];
  execFile('unzip', args, opts, cb);
}

function extractTar(archfile, destpath, cb) {
  var opts = {
    cwd: destpath,
    timeout: ARCHIVE_TIMEOUT
  };
  var args = [ 'xf', archfile ];
  execFile('tar', args, opts, cb);
}

function extractBzipTar(archfile, destpath, cb) {
  var opts = {
    cwd: destpath,
    timeout: ARCHIVE_TIMEOUT
  };
  var bunzipArgs = [ '-c', archfile ];
  var tarArgs = [ 'xf', '-' ];
  var bunzip = spawn('bunzip2', bunzipArgs, opts);
  var tar = spawn('tar', tarArgs, opts);
  var expecting = 2;
  var firsterr = null;
  var errh = function(name, code) {
    expecting--;
    if (code !== 0) {
      firsterr = firsterr || new Error(name + ' error ' + code);
    }
    if (expecting === 0) {
      cb(firsterr);
    }
  };
  tar.on('exit', function(code) { errh('tar', code); } );
  bunzip.on('exit', function(code) { errh('bunzip', code); } );
  bunzip.stdout.pipe(tar.stdin);
}

function extractGzipTar(archfile, destpath, cb) {
  var opts = {
    cwd: destpath,
    timeout: ARCHIVE_TIMEOUT
  };
  var gunzipArgs = [ '-c', archfile ];
  var tarArgs = [ 'xf', '-' ];
  var gunzip = spawn('gunzip', gunzipArgs, opts);
  var tar = spawn('tar', tarArgs, opts);
  var expecting = 2;
  var firsterr = null;
  var errh = function(name, code) {
    expecting--;
    if (code !== 0) {
      firsterr = firsterr || new Error(name + ' error ' + code);
    }
    if (expecting === 0) {
      cb(firsterr);
    }
  };
  tar.on('exit', function(code) { errh('tar', code); } );
  gunzip.on('exit', function(code) { errh('gunzip', code); } );
  gunzip.stdout.pipe(tar.stdin);
}

function extractFile(archfile, destpath, callback) {
  async.waterfall([
    function(next) { // determine archive type
      archiveType(archfile, next);
    },
    function(res, next) { // extract based on type
      switch (res.type) {
        case 'tar':
          return extractTar(archfile, destpath, next);
        case 'gzip':
          return extractGzipTar(archfile, destpath, next);
        case 'bzip2':
          return extractBzipTar(archfile, destpath, next);
        case 'zip':
          return extractZip(archfile, destpath, next);
        default:
          return callback(new Error('unsupported archive type'));
      }
    }
  ], function(err) { // final callback
    callback(err);
  });
}

exports.extractFile = extractFile;
