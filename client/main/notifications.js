
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

        this.$title = $('<div class="silky-notification-title"></div>').appendTo(this.$el);
        this.$body  = $('<div class="silky-notification-body"></div>').appendTo(this.$el);

        this.$content = $('<div class="silky-notification-content"></div>').appendTo(this.$body);

        this.$message = $('<div class="silky-notification-message"></div>').appendTo(this.$content);

        this.$buttons = $('<div class="silky-notification-buttons"></div>').appendTo(this.$body);

        this.$ok = $('<div class="silky-notification-button-ok">OK</div>').appendTo(this.$buttons);

        this._finished = () => {
            this.trigger('finished');
        };
        this.dismiss = () => {
            this.$el.one('transitionend', this._finished);
            this.model.set('visible' , false);
        };
        this.reshow = () => {
            this.$el.off('transitionend', this._finished);
            clearTimeout(this.timeout);
            this.model.attributes.visible = true;
            if (this.model.duration !== 0)
                this.timeout = setTimeout(this.dismiss, this.model.duration);
            setTimeout(() => this._update(), 50);
        };

        this.reshow();
    },
    _update: function() {

        this.$el.toggleClass('hidden', this.model.attributes.visible === false);
        this.$message.text(this.model.attributes.message);
        this.$title.text(this.model.attributes.title);
    }
});

const Notifications = function($el) {
    this.$el = $el;
    this.$el.addClass('silky-notifications');
    this.list = [ ];
};

Notifications.prototype.notify = function(notification) {

    let found = false;

    for (let item of this.list) {
        if (item.model === notification) {
            found = true;
            item.$view.reshow();
            break;
        }
    }

    if (found === false) {
        let $el = $('<div></div>').appendTo(this.$el);
        let $view = new NotificationView({ el : $el, model : notification });
        let item = { model: notification, $view: $view };
        this.list.push(item);

        $view.on('finished', () => {
            this.list = this.list.filter(v => v !== item);
            $view.remove();
        });
    }
};

module.exports = Notifications;
