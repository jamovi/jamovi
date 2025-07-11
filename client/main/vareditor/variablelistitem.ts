
'use strict';

import $ from 'jquery';
import focusLoop from '../../common/focusloop';

const VariableListItem = function(variable) {
    this.variable = variable;
    this.name = variable.name;

    let labelId = focusLoop.getNextAriaElementId('label');
    this.id = focusLoop.getNextAriaElementId('listitem');
    this.$el = $(`<div id="${this.id}" class="jmv-variable-list-item" role="listitem" aria-labelledby="${labelId}"></div>`);

    this.$icon = $(`<div class="icon variable-type-${variable.measureType} data-type-${variable.dataType}"></div>`).appendTo(this.$el);
    this.$label = $(`<div id="${labelId}" class="label">${this.name}</div>`).appendTo(this.$el);

    this.$el.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



export default VariableListItem;
