'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const Tracker = require('./itemtracker');

const b64 = require('../common/utils/b64');
const { contextMenuListener } = require('../common/utils');

require('./refs');

const ElementModel = Backbone.Model.extend({
    defaults: {
        refs: [ ],
        refTable: null,
    },
});

const ElementView = Backbone.View.extend({
    initialize(data) {

        this.layout = new Tracker();

        this.updateItem = data.update;
        this.parent = data.parent;
        this.level = ('level' in data) ? data.level : 0;
        this.fmt = data.fmt;

        this.$el.addClass('jmv-results-item');
        this.$el.attr('data-name', b64.enc(this.model.attributes.name));

        contextMenuListener(this.$el[0], event => {
            if ('activeElement' in document)
                document.activeElement.blur();
            event.stopPropagation();
            this._sendEvent({ type: 'menu', data: { entries: [], pos: { left: event.pageX, top: event.pageY } } });
            event.preventDefault();
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
            if (this.$el.hasClass('jmv-results-error'))
                this.$errorPlacement.find('.jmv-results-error-message').text(error.message);
            else {
                this.$el.addClass('jmv-results-error');
                $(`<div class="jmv-results-error-message">${ error.message }</div>`).appendTo(this.$errorPlacement);
            }
        }
        else {
            this.$el.removeClass('jmv-results-error');
            this.$errorPlacement.empty();
        }
    },

    _collapseSection() {
        let element = this.$el[0];
        let sectionHeight = element.scrollHeight;

        let elementTransition = element.style.transition;
        element.style.transition = '';

        requestAnimationFrame(() => {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;
            requestAnimationFrame(() => {
                element.style.height = 0 + 'px';
            });
        });
    },

    _expandSection(value) {

        let element = this.$el[0];

        element.setAttribute('data-expanding', true);
        let sectionHeight = element.scrollHeight;

        element.style.height = value === undefined ? sectionHeight : value;

        element.addEventListener('transitionend', (e) => {
            element.removeEventListener('transitionend', e.callee);
            element.style.height = null;
            element.setAttribute('data-expanding', false);
        });
    },
    update(data) {

        if (this.updateItem(this, data.element, data.options, data.level, data.mode, data.devMode, data.fmt, data.refTable)) {
            this.layout.begin();
            this.render();
            this.layout.end();
            return true;
        }
        return false;
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
                label: this.label(),
                name: this.type().toLowerCase(),
                address: this.address(),
                title: this.model.attributes.title,
                options: options,
            };
            event.data.entries.unshift(entry);
            this.parent._sendEvent(event);
        }
    },
    _menuOptions(event) {
        return [ { name: 'copy', label: _('Copy') }, { name: 'export', label: `${_('Export')}...` }, { name: 'addNote', label: _('Add Note')} ];
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
