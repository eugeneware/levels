
/*!
 * levels
 * Copyright(c) 2013 Eugene Ware <eugene@noblesamurai.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var natural = require('natural')
  , metaphone = natural.Metaphone.process
  , stem = natural.PorterStemmer.stem
  , stopwords = natural.stopwords
  , sublevel = require('level-sublevel')
  , _ = require('underscore')
  , async = require('async')
  , noop = function(){};

/**
 * Library version.
 */

exports.version = '0.0.3';

/**
 * Expose `Search`.
 */

exports.Search = Search;

/**
 * Expose `Query`.
 */

exports.Query = Query;

/**
 * Search types.
 */

var types = {
    intersect: 'intersection'
  , union: 'union'
  , and: 'intersection'
  , or: 'union'
};

/**
 * Return a new levels `Search` with the given `key`.
 *
 * @param {String} key
 * @return {Search}
 * @api public
 */

exports.createSearch = function(db, key){
  if (!db) throw new Error('createSearch() requires a levelup db');
  if (!key) throw new Error('createSearch() requires a leveldb key for namespacing');
  return new Search(db, key);
};

/**
 * Return the words in `str`.
 *
 * @param {String} str
 * @return {Array}
 * @api private
 */

exports.words = function(str){
  return String(str).match(/\w+/g);
};

/**
 * Stem the given `words`.
 *
 * @param {Array} words
 * @return {Array}
 * @api private
 */

exports.stem = function(words){
  var ret = [];
  for (var i = 0, len = words.length; i < len; ++i) {
    ret.push(stem(words[i]));
  }
  return ret;
};

/**
 * Strip stop words in `words`.
 *
 * @param {Array} words
 * @return {Array}
 * @api private
 */

exports.stripStopWords = function(words){
  var ret = [];
  if (words) {
    for (var i = 0, len = words.length; i < len; ++i) {
      if (~stopwords.indexOf(words[i])) continue;
      ret.push(words[i]);
    }
  }
  return ret;
};

/**
 * Returns an object mapping each word in a Array
 * to the number of times it occurs in the Array.
 *
 * @param {Array} words
 * @return {Object}
 * @api private
 */

exports.countWords = function(words){
  var obj = {};
  for (var i = 0, len = words.length; i < len; ++i) {
    obj[words[i]] = (obj[words[i]] || 0) + 1;
  }
  return obj;
};

/**
 * Return the given `words` mapped to the metaphone constant.
 *
 * Examples:
 *
 *    metaphone(['tobi', 'wants', '4', 'dollars'])
 *    // => { '4': '4', tobi: 'TB', wants: 'WNTS', dollars: 'TLRS' }
 *
 * @param {Array} words
 * @return {Object}
 * @api private
 */

exports.metaphoneMap = function(words){
  var obj = {};
  for (var i = 0, len = words.length; i < len; ++i) {
    obj[words[i]] = metaphone(words[i]);
  }
  return obj;
};

/**
 * Return an array of metaphone constants in `words`.
 *
 * Examples:
 *
 *    metaphone(['tobi', 'wants', '4', 'dollars'])
 *    // => ['4', 'TB', 'WNTS', 'TLRS']
 *
 * @param {Array} words
 * @return {Array}
 * @api private
 */

exports.metaphoneArray = function(words){
  var arr = []
    , constant;
  for (var i = 0, len = words.length; i < len; ++i) {
    constant = metaphone(words[i]);
    if (!~arr.indexOf(constant)) arr.push(constant);
  }
  return arr;
};

/**
 * Return a map of metaphone constant leveldb keys for `words`
 * and the given `key`.
 *
 * @param {String} key
 * @param {Array} words
 * @return {Array}
 * @api private
 */

exports.metaphoneKeys = function(key, words){
  return exports.metaphoneArray(words).map(function(c){
    return ['word', c];
  });
};

/**
 * Initialize a new `Query` with the given `str`
 * and `search` instance.
 *
 * @param {String} str
 * @param {Search} search
 * @api public
 */

function Query(str, search) {
  this.str = str;
  this.type('and');
  this.search = search;
}

/**
 * Set `type` to "union" or "intersect", aliased as
 * "or" and "and".
 *
 * @param {String} type
 * @return {Query} for chaining
 * @api public
 */

Query.prototype.type = function(type){
  this._type = types[type];
  return this;
};

/**
 * Perform the query and callback `fn(err, ids)`.
 *
 * @param {Function} fn
 * @return {Query} for chaining
 * @api public
 */

Query.prototype.end = function(fn){
  var key = this.search.key
    , db = this.search.db
    , query = this.str
    , words = exports.stem(exports.stripStopWords(exports.words(query)))
    , keys = exports.metaphoneKeys(key, words)
    , type = this._type;

  if (!keys.length) return fn(null, []);
  async.map(keys,
    function (key, cb) {
      var hits = [];
      db.createReadStream({
          start: key.concat(-Infinity),
          end: key.concat(+Infinity)
        })
        .on('data', function (data) {
          hits.push(data.value);
        })
        .on('end', function (err) {
          cb(null, hits);
        });
    },
    function (err, results) {
      fn(err, _[type].apply(null, results).sort());
    });

  return this;
};

/**
 * Initialize a new `Search` with the given `key`.
 *
 * @param {String} key
 * @api public
 */

function Search(db, key) {
  this.key = key;
  this.db = db;
}

/**
 * Index the given `str` mapped to `id`.
 *
 * @param {String} str
 * @param {Number|String} id
 * @param {Function} fn
 * @api public
 */

Search.prototype.index = function(str, id, fn){
  var key = this.key
    , db = this.db
    , words = exports.stem(exports.stripStopWords(exports.words(str)))
    , counts = exports.countWords(words)
    , map = exports.metaphoneMap(words)
    , keys = Object.keys(map);

  var cmds = [];

  keys.forEach(function (word) {
    cmds.push({
      type: 'put',
      key: ['word', map[word], parseInt(id)],
      value: parseInt(id)
    });

    cmds.push({
      type: 'put',
      key: ['object', id, map[word]],
      value: map[word]
    });
  });

  db.batch(cmds, fn || noop);

  return this;
};

/**
 * Remove occurrences of `id` from the index.
 *
 * @param {Number|String} id
 * @api public
 */

Search.prototype.remove = function(id, fn){
  fn = fn || noop;
  var key = this.key
    , db = this.db;

  db.createReadStream({
      start: ['object', id, '\x00'],
      end: ['object', id, '\xff']
    })
    .on('data', function (data) {
      removeWords(data.value, fn);
      db.del(data.key, function (err) {
        if (err) return fn(err);
      });
    })
    .on('end', fn);

  function removeWords(word, cb) {
    db.createReadStream({
        start: ['word', word, -Infinity],
        end: ['word', word, +Infinity]
      })
      .on('data', function (data) {
        db.del(data.key, function (err) {
          if (err) return fn(err);
        });
      });
  }
};

/**
 * Perform a search on the given `query` returning
 * a `Query` instance.
 *
 * @param {String} query
 * @param {Query}
 * @api public
 */

Search.prototype.query = function(query){
  return new Query(query, this);
};
