
'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const NotificationView = Backbone.View.extend({
    className: "notification",
    initialize: function() {

        this.$el.addClass('jmv-notification hidden');
        this.$el.attr('data-type', this.model.get('type'));

        this.model.on('change', () => this._update());
        this.model.on('change:dismissed', () => this.dismiss());
        this.handlers = [];

        this.$icon  = $('<div class="jmv-notification-icon"></div>').appendTo(this.$el);
        this.$info = $('<div class="jmv-notification-info"></div>').appendTo(this.$el);

        this.$title = $('<div class="jmv-notification-title"></div>').appendTo(this.$info);
        this.$body  = $('<div class="jmv-notification-body"></div>').appendTo(this.$info);

        this.$content = $('<div class="jmv-notification-content"></div>').appendTo(this.$body);

        this.$progressBar = $('<div class="jmv-notification-progressbar"></div>').appendTo(this.$content);
        this.$progressBarBar = $('<div class="jmv-notification-progressbarbar"></div>').appendTo(this.$progressBar);

        this.$message = $('<div class="jmv-notification-message"></div>').appendTo(this.$content);

        this.$buttons = $('<div class="jmv-notification-buttons"></div>').appendTo(this.$content);
        this.$cancel = $(`<div class="jmv-notification-button-cancel">${ _('Cancel') }</div>`).appendTo(this.$buttons);

        this.$cancel[0].addEventListener('click', (event) => {
            this.model.cancel();
            this.model.dismiss();
        });

        this._finished = () => {
            this.trigger('finished');
        };
        this.dismiss = () => {
            this.$el.one('transitionend', this._finished);
            this.model.set('visible', false);
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

        if (this.model.attributes.progress[1] > 0) {
            this.$progressBarBar.css('width', `${ 100 * this.model.attributes.progress[0] / this.model.attributes.progress[1] }%`);
            this.$progressBar.show();
            this.$message.hide();
        }
        else {
            this.$progressBar.hide();
            this.$message.show();
        }

        this.$buttons[0].style.display = (this.model.attributes.cancel ? null : 'none');
    }
});

const Notifications = function($el) {
    this.$el = $el;
    this.$el.addClass('jmv-notifications');
    this.list = [ ];
};

Notifications.prototype.notify = function(notification) {

    let found = false;
    let dismiss = notification.attributes.dismissed;

    for (let item of this.list) {
        if (item.model === notification
                || (notification.id !== undefined
                    && notification.id === item.model.attributes.id)) {
            found = true;
            if ( ! dismiss) {
                item.model.set(notification.attributes);
                item.$view.reshow();
            }
            else {
                item.model.dismiss();
            }
            break;
        }
    }

    if (found === false && dismiss === false) {
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
