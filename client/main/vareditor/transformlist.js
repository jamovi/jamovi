
'use strict';

const $ = require('jquery');
const TransformListItem = require('./transformlistitem');

const TransformList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.$el = $('<div class="jmv-transform-list"></div>');

    this.$top = $('<div class="top"></div>').appendTo(this.$el);
    this.$none =$(`<div class="transform-none-item">${_('None')}</div>`).appendTo(this.$top);

    this.$middle = $('<div class="middle"></div>').appendTo(this.$el);

    this.$bottom = $('<div class="bottom"></div>').appendTo(this.$el);
    this.$createNew = $(`<div class="transform-create">${_('Create New Transform...')}</div>`).appendTo(this.$bottom);

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
