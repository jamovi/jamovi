'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var createItem = require('./create').createItem;

var mainWindow = null;
var  results = null;
var $results = null;
var active = null;

var _reallyNotifyResize = function() {
    var width  = $results.width();
    var height = $results.height();

    mainWindow.postMessage({ eventType : 'sizeChanged', eventData : { width: width, height: height }}, '*');
};

var _sendMenuRequest = function(data) {
    var entries = data.data;
    entries[0].type = 'Analysis';
    mainWindow.postMessage({ eventType : 'menuRequest', eventData : entries }, '*');

    var lastEntry = entries[entries.length-1];
    _activeChanged(lastEntry.address);
};

var _notifyResize = _.debounce(_reallyNotifyResize, 0);

window.addEventListener('message', function(event) {

    if (event.source === window)
        return;

    mainWindow = event.source;
    var hostEvent = event.data;

    if (hostEvent.type === 'results') {
        var content = '';
        var $body = $('body');
        $body.attr('data-mode', hostEvent.mode);
        $body.empty();

        $results = $('<div id="results"></div>');
        results = createItem(hostEvent.results, $results, 0, { _sendEvent: _sendMenuRequest }, hostEvent.mode);
        $results.appendTo($body);

        _notifyResize();
    }
    else if (hostEvent.type === 'click') {
        var el = document.elementFromPoint(hostEvent.pageX, hostEvent.pageY);
        if (el !== null)
            $(el).trigger('click', hostEvent);
    }
    else if (hostEvent.type === 'activeChanged') {
        _activeChanged(hostEvent.data);
    }
});

var _activeChanged = function(address) {
    if (active !== null) {
        active.$el.removeClass('active');
        active = null;
    }

    if (address === null)
        return;

    if (address.length === 1) {
        active = results;
        active.$el.addClass('active');
    }
    else {
        address = _.clone(address);
        address.shift();
        active = results.get(address);
        active.$el.addClass('active');
    }
};
