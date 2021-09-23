
'use strict';

const $ = require('jquery');

const TransformListItem = function(transform, checked) {
    this.transform = transform;
    this.name = transform.name;
    this.checked = checked;

    this.$el = $('<div class="jmv-transform-list-item"></div>');

    this.$el.on('mouseenter', (event) => {
        this.$edit.removeClass('hidden');
        this.$duplicate.removeClass('hidden');
        this.$remove.removeClass('hidden');
    });

    this.$el.on('mouseleave', (event) => {
        this.$edit.addClass('hidden');
        this.$duplicate.addClass('hidden');
        this.$remove.addClass('hidden');
    });

    this._calculateColour = function(colourIndex) {
        let base = colourIndex % 12;
        let g = base % 6;
        let p = [0, 4, 2, 5, 1, 3];
        if (base < 6)
            return 'hsl(' + (p[g] * 60) + ', 48%, 57%)';

        return 'hsl(' + (30 + (p[g] * 60)) + ', 17%, 52%)';
    };

    this.$icon = $('<div class="icon"></div>').appendTo(this.$el);
    this.$colour = $('<div class="colour" style="background-color: ' + this._calculateColour(transform.colourIndex) + '"></div>').appendTo(this.$el);
    this.$label = $('<div class="label">' + this.name + '</div>').appendTo(this.$el);
    this.$edit = $(`<div class="edit hidden" title="${_('Edit transform')}"></div>`).appendTo(this.$el);
    this.$duplicate = $(`<div class="duplicate hidden" title="${_('Duplicate transform')}"></div>`).appendTo(this.$el);
    this.$remove = $(`<div class="remove hidden" title="${_('Delete transform')}"><span class="mif-cross"></span></div>`).appendTo(this.$el);

    this.$edit.on('click', (event) => {
        this.$el.trigger('editing', this);
        event.preventDefault();
        event.stopPropagation();
    });

    this.$duplicate.on('click', (event) => {
        this.$el.trigger('duplicate', this);
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
