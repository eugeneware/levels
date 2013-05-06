
/**
 * Module dependencies.
 */

var levels = require('../')
  , should = require('should')
  , rimraf = require('rimraf')
  , levelup = require('levelup')
  , sublevel = require('level-sublevel')
  , async = require('async');

var start = new Date;

levels.version.should.match(/^\d+\.\d+\.\d+$/);

levels
  .words('foo bar baz ')
  .should.eql(['foo', 'bar', 'baz']);

levels
  .words(' Punctuation and whitespace; should be, handled.')
  .should.eql(['Punctuation', 'and', 'whitespace', 'should', 'be', 'handled']);

levels
  .stripStopWords(['this', 'is', 'just', 'a', 'test'])
  .should.eql(['just', 'test']);

levels
  .countWords(['foo', 'bar', 'baz', 'foo', 'jaz', 'foo', 'baz'])
  .should.eql({
    foo: 3
    , bar: 1
    , baz: 2
    , jaz: 1
  });

levels
  .metaphoneMap(['foo', 'bar', 'baz'])
  .should.eql({
      foo: 'F'
    , bar: 'BR'
    , baz: 'BS'
  });

levels
  .metaphoneArray(['foo', 'bar', 'baz'])
  .should.eql(['F', 'BR', 'BS'])

levels
  .metaphoneKeys('levels', ['foo', 'bar', 'baz'])
  .should.eql(['word:F', 'word:BR', 'word:BS']);

levels
  .metaphoneKeys('foobar', ['foo', 'bar', 'baz'])
  .should.eql(['word:F', 'word:BR', 'word:BS']);

var dbPath = '/tmp/levels'
  , db
  , search;

rimraf.sync(dbPath);
db = levelup(dbPath, function (err) {
  db = sublevel(db);
  search = levels.createSearch(db, 'levels');
  var docs = {
    0: 'Tobi wants 4 dollars',
    2: 'Loki is a ferret',
    3: 'Tobi is also a ferret',
    4: 'Jane is a bitchy ferret',
    5: 'Tobi is employed by LearnBoost',
    6: 'computing stuff',
    7: 'simple words do not mean simple ideas',
    8: 'The dog spoke the words, much to our unbelief.',
    9: 'puppy dog eagle puppy frog puppy dog simple'
  };

  async.eachSeries(
    Object.keys(docs),
    function (id, cb) {
      search.index(docs[id], id, cb);
    },
    test);
});

function test() {
  var pending = 0;

  ++pending;
  search
    .query('stuff compute')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([6]);
      --pending || done();
    });

  ++pending;
  search
    .query('Tobi')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(3);
      ids.should.include(0);
      ids.should.include(3);
      ids.should.include(5);
      --pending || done();
    });

  ++pending;
  search
    .query('tobi')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(3);
      ids.should.include(0);
      ids.should.include(3);
      ids.should.include(5);
      --pending || done();
    });

  ++pending;
  search
    .query('bitchy')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([4]);
      --pending || done();
    });

  ++pending;
  search
    .query('bitchy jane')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([4]);
      --pending || done();
    });

  ++pending;
  search
    .query('loki and jane')
    .type('or')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(2);
      ids.should.include(2);
      ids.should.include(4);
      --pending || done();
    });

  ++pending;
  search
    .query('loki and jane')
    .type('or')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(2);
      ids.should.include(2);
      ids.should.include(4);
      --pending || done();
    });

  ++pending;
  search
    .query('loki and jane')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([]);
      --pending || done();
    });

  ++pending;
  search
    .query('jane ferret')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([4]);
      --pending || done();
    });

  ++pending;
  search
    .query('is a')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.eql([]);
      --pending || done();
    });

  ++pending;
  search
    .query('simple')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(2);
      ids.should.include(7);
      ids.should.include(9);
      ids[0].should.eql(7);
      ids[1].should.eql(9);
      --pending || done();
    });

  ++pending;
  search
    .query('dog ideas')
    .type('or')
    .end(function(err, ids){
      if (err) throw err;
      ids.should.have.length(3);
      ids.should.include(7);
      ids.should.include(8);
      ids.should.include(9);
      --pending || done();
    });

  ++pending;
  search
    .index('keyboard cat', 6, function(err){
      if (err) throw err;
      search.query('keyboard').end(function(err, ids){
        if (err) throw err;
        ids.should.eql([6]);
        search.query('cat').end(function(err, ids){
          if (err) throw err;
          ids.should.eql([6]);
          search.remove(6, function(err){
            if (err) throw err;
            search.query('keyboard').end(function(err, ids){
              if (err) throw err;
              ids.should.be.empty;
              search.query('cat').end(function(err, ids){
                if (err) throw err;
                ids.should.be.empty;
                --pending || done();
              });
            });
          });
        });
      });
    });
}

function done() {
  console.log();
  console.log('  tests completed in %dms', new Date - start);
  console.log();
  process.exit();
}
