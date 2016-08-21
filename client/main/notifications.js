
'use strict';

var $ = require('jquery');

const Notification = require('./notification');

const Notifications = function($el) {
    this.$el = $el;
    this._list = [ ];
};

Notifications.prototype.notify = function(request) {

    console.log('notification received');
    console.log(request.attributes);
    
    var $note = $('<div id="notification"></div>');
    this.$el.append($note);
    request.set("index", this._list.length);
    request.parent = this;
    var note = new Notification({el : $note, model : request});
    this._list.push({request: request, view: note});
};

Notifications.prototype.remove = function(view) {

    var index = this._list.map(function(e) { return e.view; }).indexOf(view);
    view.$el.remove();
    this._list.splice(index, 1);
    for (var i = 0; i<this._list.length; i++){
        this._list[i].request.set("index", i);
    }
};

module.exports = Notifications;
