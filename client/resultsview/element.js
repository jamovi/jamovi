'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;

const b64 = require('../common/utils/b64');

require('./refs');

const ElementModel = Backbone.Model.extend({
    defaults: {
        refs: [ ],
        refTable: null,
    },
});

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
        this.addIndex = 1;

        this.refs = document.createElement('jmv-reference-numbers');
        this.refs.setTable(this.model.attributes.refTable);
        this.refs.setRefs(this.model.attributes.refs);
        this.el.appendChild(this.refs);

        this.ready = Promise.resolve();
    },
    render() {
        let error = this.model.get('error');
        if (error !== null) {
            this.$el.addClass('jmv-results-error');
            let $error = $('<div class="jmv-results-error-message"></div>');
            $error.text(error.message);
            $error.appendTo(this.$errorPlacement);
        }
    },
    addContent($el) {
        let before = this.$el.children()[this.addIndex - 1];
        $el.insertAfter(before);
        this.addIndex += 1;
    },
    _sendEvent(event) {
        if (this.parent === null)
            return;

        if (event.type === 'menu') {
            let options = this._menuOptions();
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
    _menuOptions(event) {
        return [ { label: 'Copy' }, { label: 'Export' } ];
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
    },
    isRoot() {
        return ! (this.parent && this.parent.address);
    }
});

module.exports = { View: ElementView, Model: ElementModel };
