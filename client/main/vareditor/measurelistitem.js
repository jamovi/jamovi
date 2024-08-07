
'use strict';

const $ = require('jquery');

const MeasureListItem = function(measureType, text) {
    this.measureType = measureType;
    this.name = text ? text : measureType;

    this.$el = $('<div class="jmv-measure-list-item" role="listitem"></div>');

    this.$el.attr('data-id', measureType);

    this.$icon = $('<div class="icon measure-type-' + this.measureType + '"></div>').appendTo(this.$el);
    this.$label = $('<div class="label">' + this.name + '</div>').appendTo(this.$el);


    this.$el.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



module.exports = MeasureListItem;
