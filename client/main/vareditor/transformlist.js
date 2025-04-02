
'use strict';

const $ = require('jquery');
const TransformListItem = require('./transformlistitem');
const focusLoop = require('../../common/focusloop');

const TransformList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.id = focusLoop.getNextAriaElementId('list');
    this.$el = $(`<div id="${this.id}" class="jmv-transform-list" role="list"></div>`);

    this.$top = $('<div class="top"></div>').appendTo(this.$el);
    this.$none =$(`<button role="listitem" class="transform-none-item">${_('None')}</button>`).appendTo(this.$top);

    this.$middle = $('<div role="presentation" class="middle"></div>').appendTo(this.$el);

    this.$bottom = $('<div role="presentation" class="bottom"></div>').appendTo(this.$el);
    this.$createNew = $(`<button role="listitem" class="transform-create">${_('Create New Transform...')}</button>`).appendTo(this.$bottom);

    this.$createNew.on('click', (event) => {
        this.$el.trigger('create-transform');
    });

    this.$none.on('click', (event) => {
        this.$el.trigger('selected-transform', { name: 'None', id: 0 });
    });

    this.populate = function(transforms) {
        this.$middle.empty();
        for (let transform of transforms) {
            let item = new TransformListItem(transform, false);
            item.$el.appendTo(this.$middle);
            this._createItemEvents(item);
        }
    };

    this._createItemEvents = function(item) {
        item.$el.on('selected', () => {
            this.$el.trigger('selected-transform', item.transform);
        });
        item.$el.on('editing', (x) => {
            this.$el.trigger('edit-transform', item.transform);
        });
        item.$el.on('duplicate', (x) => {
            this.$el.trigger('duplicate-transform', item.transform);
        });
        item.$el.on('remove', (x) => {
            this.$el.trigger('remove-transform', item.transform);
        });
    };
};



module.exports = TransformList;
