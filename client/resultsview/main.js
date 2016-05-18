'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var createItem = require('./create').createItem;

var mainWindow = null;

var _notifyResize = function() {
    setTimeout(_reallyNotifyResize, 0);
};

var _reallyNotifyResize = function() {
    var width = $(document).width();
    var height = $(document).height();
    mainWindow.postMessage({ eventType : 'sizeChanged', eventData : { width: width, height: height }}, '*');
};

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
