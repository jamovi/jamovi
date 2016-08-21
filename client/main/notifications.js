
'use strict';

var $ = require('jquery');

const NotificationView = require('./notification');

const Notifications = function($el) {
    this.$el = $el;
    this._list = [ ];
};

Notifications.prototype.notify = function(request) {
    var $note = $('<div id="notification"></div>');
    this.$el.append($note);
    request.set("index", this._list.length);
    var note = new NotificationView({el : $note, model : request});
    note.subscribe(this.remove, this);
    this._list.push({request: request, view: note});
};

Notifications.prototype.remove = function(view) {
    var index = this._list.map(e => e.view).indexOf(view);
    view.$el.remove();
    this._list.splice(index, 1);
    for (var i = 0; i<this._list.length; i++) {
        this._list[i].request.set("index", i);
    }
    view.unsubscribe(this.remove);
};

module.exports = Notifications;
