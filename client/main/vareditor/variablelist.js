
'use strict';

const $ = require('jquery');
const VariableListItem = require('./variablelistitem');

const VariableList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.$el = $('<div class="jmv-variable-list"></div>');

    this.$middle = $('<div class="middle"></div>').appendTo(this.$el);

    this.populate = function(columns) {
        this.$middle.empty();
        for (let column of columns) {
            if (column.columnType === 'data') {
                let item = new VariableListItem(column);
                item.$el.appendTo(this.$middle);
                this._createItemEvents(item);
            }
        }
    };

    this._createItemEvents = function(item) {
        item.$el.on('selected', () => {
            this.$el.trigger('selected-variable', item.variable);
        });
    };
};



module.exports = VariableList;
