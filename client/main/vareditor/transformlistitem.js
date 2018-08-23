
'use strict';

const $ = require('jquery');

const TransformListItem = function(transform, checked) {
    this.transform = transform;
    this.name = transform.name;
    this.checked = checked;

    this.$el = $('<div class="jmv-transform-list-item"></div>');

    this.$el.on('mouseenter', (event) => {
        this.$edit.removeClass('hidden');
        this.$remove.removeClass('hidden');
    });

    this.$el.on('mouseleave', (event) => {
        this.$edit.addClass('hidden');
        this.$remove.addClass('hidden');
    });

    this.$icon = $('<div class="icon"></div>').appendTo(this.$el);
    this.$label = $('<div class="label">' + this.name + '</div>').appendTo(this.$el);
    this.$edit = $('<div class="edit hidden">edit</div>').appendTo(this.$el);
    this.$remove = $('<div class="remove hidden"><span class="mif-cross"></span></div>').appendTo(this.$el);

    this.$edit.on('click', (event) => {
        this.$el.trigger('editing', this);
        event.preventDefault();
        event.stopPropagation();
    });

    this.$remove.on('click', (event) => {
        this.$el.trigger('remove', this);
        event.preventDefault();
        event.stopPropagation();
    });

    this.$el.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



module.exports = TransformListItem;
