'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

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
    
    var results = event.data;
    
    if (_.has(results, 'title'))
        content += '<h2>' + results.title + '</h2>';
    
    results.elements.forEach(function(element) {
        if (_.has(element, 'title'))
            content += '<h3>' + element.title + '</h3>';
        content += '<pre>' + element.text + '</pre>';
    });
    
    $("body").empty().append(content);

    _notifyResize();
});
