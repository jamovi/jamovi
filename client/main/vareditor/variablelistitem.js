
'use strict';

const $ = require('jquery');

const VariableListItem = function(variable) {
    this.variable = variable;
    this.name = variable.name;

    this.$el = $('<div class="jmv-variable-list-item"></div>');

    this.$icon = $('<div class="icon variable-type-' + variable.measureType + ' data-type-' + variable.dataType + '"></div>').appendTo(this.$el);
    this.$label = $('<div class="label">' + this.name + '</div>').appendTo(this.$el);


    this.$el.on('click', (event) => {
        this.$el.trigger('selected', this);
    });
};



module.exports = VariableListItem;
