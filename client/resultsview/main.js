'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var createItem = require('./create').createItem;

var mainWindow = null;

var _reallyNotifyResize = function() {
    var width  = $(document).width() + 8;
    var height = $(document).height() + 8;

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

    createItem(results).appendTo($body);

    _notifyResize();
});
