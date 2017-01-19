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
    _sendEvent(event) {
        if (this.parent === null)
            return;

        if (event.type === 'menu') {
            let options = [ { label: 'Copy' }, { label: 'Save' } ];
            let entry = { type: this.type(), address: this.address(), options: options };
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
            addr = [ this.model.attributes.name ];
        }
        return addr;
    }
});

module.exports = { View: ElementView };
