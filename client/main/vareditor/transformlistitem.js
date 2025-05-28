
'use strict';

const $ = require('jquery');
const focusLoop = require('../../common/focusloop');

const TransformListItem = function(transform, checked) {
    this.transform = transform;
    this.name = transform.name;
    this.checked = checked;

    this.$el = $('<div role=""presentation" class="jmv-transform-list-item"></div>');

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
    this.id = focusLoop.getNextAriaElementId('listitem');
    this.$label = $(`<button role="listitem" id="${this.id}" class="label">${this.name}</button>`).appendTo(this.$el);
    this.$edit = $(`<button class="edit hidden" aria-label="${_('Edit transform - {transformName}', {transformName: this.name})}"></button>`).appendTo(this.$el);
    this.$duplicate = $(`<button class="duplicate hidden" aria-label="${_('Duplicate transform  - {transformName}', {transformName: this.name})}"></button>`).appendTo(this.$el);
    this.$remove = $(`<button class="remove hidden" aria-label="${_('Delete transform  - {transformName}', {transformName: this.name})}"><span class="mif-cross"></span></button>`).appendTo(this.$el);

    this.$el.on('focusin', (event) => {
        this.$edit.removeClass('hidden');
        this.$duplicate.removeClass('hidden');
        this.$remove.removeClass('hidden');
    });

    this.$el.on('focusout', (event) => {
        if (this.$el[0].contains(event.relatedTarget))
            return;

        this.$edit.addClass('hidden');
        this.$duplicate.addClass('hidden');
        this.$remove.addClass('hidden');
    });

    
    this.$el.on('pointerenter', (event) => {
        this.$edit.removeClass('hidden');
        this.$duplicate.removeClass('hidden');
        this.$remove.removeClass('hidden');
    });

    this.$el.on('pointerleave', (event) => {
        this.$edit.addClass('hidden');
        this.$duplicate.addClass('hidden');
        this.$remove.addClass('hidden');
    });

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

    this.$label.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



module.exports = TransformListItem;
