// URL of the feed you want to parse
var FEED_URL = "http://rss.rtbf.be/media/rss/programmes/journal_t__l__vis___19h30.xml";
var MAX_ITEMS = 5;

var sys = require('sys')
	, FeedParser = require("feedparser")
	, async = require('async')
  , utils = require('../lib/utils')
  , request = require('request')
  , moment = require('moment')
	;

module.exports = function(server) {

  var FEED_HEADER = '<?xml version="1.0" encoding="UTF-8"?> \n\
                    <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" version="2.0">\n\
                    <channel> \n\
                    \t<title>Journal 19h30 de la RTBF Video Podcast (Belgique)</title> \n\
                    \t<language>fr-be</language>\n\
                    \t<itunes:author>@xdamman</itunes:author>\n\
                    \t<itunes:image href="'+server.set('base_url')+'/img/rtbf-19h30.jpg" />\n\
                    \t<itunes:subtitle>Video Podcast</itunes:subtitle>\n\
                    \t<description>Retrouvez tous les jours le journal de 19h30 de la Radio Télévision Belge Francophone (RTBF) sur votre AppleTV, iPad ou iPhone.</description>\n\
                    \t<itunes:category text="News &amp; Politics"/>\n\
                    \t<link>'+server.set('base_url')+'/feeds/rtbfpodcast.xml</link>\n';

  var start_time = new Date();

  var updateFeed = function(cb) {

    var pages = []
      , parser = new FeedParser();
    
    start_time = new Date();

    console.log(start_time+": Updating RSS feed");

    var items = [];
    var req = request(FEED_URL);

    req.on('response', function (res) {
      if (res.statusCode != 200) return this.emit('error', new Error('Bad status code'));
      this.pipe(parser);
    });

    req.on('error', function (error) {
      console.error("Unable to download ", FEED_URL);
    });

    parser.on('error', function(error) {
      console.error("Unable to parse ", FEED_URL);
    });

    parser.on('readable', function() {
      var stream = this
        , item;

      while (item = stream.read()) {
        process(item);
      }
    });

    var process = function(item) {
      if(!item || !item.guid) return;
      if(items.length == MAX_ITEMS) return;

      item.pubDate = (new Date(item.pubDate)).toUTCString();
      
      var matches = item.guid.match(/\?id=([0-9]+)/);
      var guid = matches[1];

      console.log("Processing " + item.guid+ " "+item.title + " " + item.pubDate);

      var page = {
            pubDate: item.pubDate
          , title: item.title
          , link: item.link
          , guid: guid
        };
      items.push(page);
    };

    parser.on("end",function() {
      async.map(items, function(item, done) {
        utils.downloadItem('rtbf/', item, done);
      },  function(err, items) {
        if(err) { console.error(err); }

        console.log("all " + items.length + " videos downloaded");
        utils.cleanDownloads('rtbf/');

        generateFeed(items, cb);
      });
    });
  };

  var generateFeed = function(items, cb) {

    var feed = FEED_HEADER;

    for(var i=0;i<items.length;i++) {
      var item = items[i];
      if(!item || !item.filepath) {
        console.log("Invalid item: ", item);
        continue;
      }

      var d = new Date(item.pubDate);
      var feeditem = '<item> \n\
                      \t<title>'+d.getDate()+'/'+(d.getMonth()+1)+' '+item.title+'</title> \n\
                      \t<enclosure url="'+server.set('base_url')+'/'+item.filepath+'" length="'+item.filesize+'" type="video/mpeg"/> \n\
                      \t<pubDate>'+item.pubDate+'</pubDate> \n\
                      \t<guid>'+server.set('base_url')+'/'+item.filepath+'</guid> \n\
                      </item>\n';

      feed += feeditem;
    }

    feed += '</channel></rss>';
    done = true;
    var timediff = (new Date) - start_time;

    console.log("\t"+items.length+" RSS items processed in "+moment.duration(timediff).humanize());

    utils.saveFeed('rtbfpodcast.xml',feed, cb);

  }

  return {
    updateFeed: updateFeed
  };
};
