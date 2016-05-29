'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var createItem = require('./create').createItem;

var mainWindow = null;
var $results = null;

var _reallyNotifyResize = function() {
    var width  = $results.width();
    var height = $results.height();

    mainWindow.postMessage({ eventType : 'sizeChanged', eventData : { width: width, height: height }}, '*');
};

var _notifyResize = _.debounce(_reallyNotifyResize, 0);

window.addEventListener('message', function(event) {

    if (event.source === window)
        return;

    mainWindow = event.source;

    var content = '';

    var $body = $('body');
    $body.empty();

    var results = event.data;

    $results = createItem(results).appendTo($body);

    _notifyResize();
});
