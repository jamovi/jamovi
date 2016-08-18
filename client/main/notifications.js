
'use strict';

// const Notification = require('./notification');

const Notifications = function($el) {
    this.$el = $el;
    this._requests = [ ];
};

Notifications.prototype.notify = function(request) {

    console.log('notification received');
    console.log(request.attributes);

    this._requests.push(request);
};

module.exports = Notifications;
