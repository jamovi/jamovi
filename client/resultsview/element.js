'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
Backbone.$ = $;

var ElementView = Backbone.View.extend({
    initialize: function(data) {

        this.parent = data.parent;

        this.$el.addClass('silky-results-item');

        var self = this;
        this.$el.on('click', function(event) {
            event.stopPropagation();
            self._sendEvent({ type : 'menu', data : [ ] });
        });
    },
    _sendEvent(event) {
        if (this.parent === null)
            return;

        if (event.type === 'menu') {
            var options = [ { label: 'Copy' }, { label: 'Save' } ];
            var entry = { type: this.type(), address: this.address(), options: options };
            event.data.unshift(entry);
            this.parent._sendEvent(event);
        }
    },
    address: function() {
        var addr;
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
