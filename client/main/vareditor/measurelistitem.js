
'use strict';

const $ = require('jquery');
import focusLoop from '../../common/focusloop';

const MeasureListItem = function(measureType, text) {
    this.measureType = measureType;
    this.name = text ? text : measureType;

    this.id = focusLoop.getNextAriaElementId('listitem');

    let labelId = focusLoop.getNextAriaElementId('label');
    this.$el = $(`<div id="${this.id}" class="jmv-measure-list-item" aria-labelledby="${labelId}" role="listitem"></div>`);

    this.$el.attr('data-id', measureType);

    this.$icon = $('<div class="icon measure-type-' + this.measureType + '"></div>').appendTo(this.$el);
    this.$label = $(`<div id="${labelId}" class="label">${this.name}</div>`).appendTo(this.$el);


    this.$el.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



module.exports = MeasureListItem;
