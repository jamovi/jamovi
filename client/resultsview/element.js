'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const ElementView = Backbone.View.extend({
    initialize(data) {

        this.parent = data.parent;
        this.level = ('level' in data) ? data.level : 0;

        this.$el.addClass('silky-results-item');
        this.$el.attr('data-name', btoa(this.model.attributes.name));

        this.$el.on('contextmenu', event => {
            event.stopPropagation();
            this._sendEvent({ type : 'menu', data : { entries : [ ], pos : { left: event.pageX, top: event.pageY } } });
            return false;
        });

        this.ready = Promise.resolve();
    },
    render() {
        let error = this.model.get('error');
        if (error !== null) {
            let $errorPlacement = $('<div class="silky-results-error-placement"></div>');
            let $error = $('<div class="silky-results-error-message"></div>');
            $error.append(error.message);
            $errorPlacement.append($error);
            this.$el.append($errorPlacement);
            this.$el.addClass('silky-results-error');
        }
    },
    _sendEvent(event) {
        if (this.parent === null)
            return;

        if (event.type === 'menu') {
            let options = [ { label: 'Copy' }, { label: 'Save' } ];
            let entry = {
                type: this.type(),
                address: this.address(),
                title: this.model.attributes.title,
                options: options,
            };
            event.data.entries.unshift(entry);
            this.parent._sendEvent(event);
        }
    },
    address() {
        let addr;
        if (this.parent && this.parent.address) {
            addr = this.parent.address();
            addr.push(this.model.attributes.name);
        }
        else {
            addr = [ ];
        }
        return addr;
    }
});

module.exports = { View: ElementView };
