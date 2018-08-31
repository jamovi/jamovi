
'use strict';

const $ = require('jquery');
const VariableListItem = require('./variablelistitem');

const VariableList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.$el = $('<div class="jmv-variable-list"></div>');
    this.$none =$('<div class="jmv-variable-list-item none-item">None</div>').appendTo(this.$el);

    this.$middle = $('<div class="middle"></div>').appendTo(this.$el);

    this.$none.on('click', (event) => {
        this.$el.trigger('selected-variable', { name: 'None', id: 0 });
    });

    this.populate = function(columns, excludeNone) {
        if (excludeNone)
            this.$none.addClass('hidden');
        else
            this.$none.removeClass('hidden');

        this.$middle.empty();
        for (let column of columns) {
            let item = new VariableListItem(column);
            item.$el.appendTo(this.$middle);
            this._createItemEvents(item);
        }
    };

    this._createItemEvents = function(item) {
        item.$el.on('selected', () => {
            this.$el.trigger('selected-variable', item.variable);
        });
    };
};



module.exports = VariableList;
