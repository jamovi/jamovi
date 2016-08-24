
'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const SilkyView = require('./view');

const NotificationView = SilkyView.extend({
    className: "notification",
    events : {
        'click .silky-notification-button-ok': 'dismiss'
    },
    initialize: function() {

        this.$el.addClass("silky-notification hidden");

        this.model.on("change", () => this._update());
        this.handlers = [];

        this.$title = $('<div class="silky-notification-title">' + this.model.title + '</div>').appendTo(this.$el);
        this.$body  = $('<div class="silky-notification-body"></div>').appendTo(this.$el);

        this.$content = $('<div class="silky-notification-content"></div>').appendTo(this.$body);

        this.$message = $('<div class="silky-notification-message"></div>').appendTo(this.$content);

        this.$buttons = $('<div class="silky-notification-buttons"></div>').appendTo(this.$body);

        this.$ok = $('<div class="silky-notification-button-ok">OK</div>').appendTo(this.$buttons);

        if (this.model.duration !== 0)
            setTimeout(() => this.dismiss(), this.model.duration);

        setTimeout(() => this._update(), 50);
    },
    _update: function() {

        this.$el.toggleClass('hidden', this.model.attributes.visible === false);
        this.$message.text(this.model.attributes.message);
    },
    dismiss: function() {
        this.$el.one('transitionend', () => this.remove());
        this.model.set('visible' , false);
    }
});

const Notifications = function($el) {
    this.$el = $el;
    this.$el.addClass('silky-notifications');
};

Notifications.prototype.notify = function(notification) {
    let $note = $('<div></div>').appendTo(this.$el);
    new NotificationView({ el : $note, model : notification }); // notificationviews destroy themselves
};

module.exports = Notifications;
