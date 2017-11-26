'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const b64 = require('../common/utils/b64');

const ElementView = Backbone.View.extend({
    initialize(data) {

        this.parent = data.parent;
        this.level = ('level' in data) ? data.level : 0;
        this.fmt = data.fmt;

        this.$el.addClass('jmv-results-item');
        this.$el.attr('data-name', b64.enc(this.model.attributes.name));

        this.$el.on('contextmenu', event => {
            event.stopPropagation();
            this._sendEvent({ type : 'menu', data : { entries : [ ], pos : { left: event.pageX, top: event.pageY } } });
            return false;
        });

        this.$errorPlacement = $('<div class="jmv-results-error-placement"></div>');
        this.$errorPlacement.appendTo(this.$el);

        this.ready = Promise.resolve();
    },
    render() {
        let error = this.model.get('error');
        if (error !== null) {
            this.$el.addClass('jmv-results-error');
            let $error = $('<div class="jmv-results-error-message"></div>');
            $error.append(error.message);
            $error.appendTo(this.$errorPlacement);
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
