
'use strict';

import $ from 'jquery';
import VariableListItem from './variablelistitem';
import focusLoop from '../../common/focusloop';

const VariableList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.items = [];

    this.id = focusLoop.getNextAriaElementId('list');
    this.$el = $(`<div id="${this.id}" class="jmv-variable-list" role="list"></div>`);
    this.$none =$(`<div class="jmv-variable-list-item none-item" data-id="0" role="listitem">${_('None')}</div>`).appendTo(this.$el);

    this.$middle = $('<div class="middle" role="presentation"></div>').appendTo(this.$el);

    this.$none.on('click', (event) => {
        this.$el.trigger('selected-variable', { name: _('None'), id: 0 });
    });

    this.setParent = function($element) {
        if (this.$parent) {
            this.$parent.off('change', null, this._valueChanged);
        }

        this.$parent = $element;

        this._valueChanged();

        this.$parent.on('change', null, this, this._valueChanged);
    };

    this._valueChanged = () => {
        this.$el.find('.jmv-variable-list-item.highlighted').removeClass('highlighted');
        let val = this.$parent.val();
        this.$el.find('.jmv-variable-list-item[data-id=' + this.$parent.val() + ']').addClass('highlighted');
        let $element = this.$el.find('.jmv-variable-list-item.highlighted');
        if ($element.length > 0) {
            $element[0].scrollIntoView(false);
            this.$parent.attr('aria-activedescendant', $element[0].getAttribute('id'));
        }
    };


    this.populate = function(columns, excludeNone) {
        if (excludeNone)
            this.$none.addClass('hidden');
        else
            this.$none.removeClass('hidden');

        this.items = [];
        this.$middle.empty();
        for (let column of columns) {
            let item = new VariableListItem(column);
            this.items.push(item);
            item.$el.appendTo(this.$middle);
            item.$el.attr('data-id', column.id);
            this._createItemEvents(item);
        }
        if (this.$parent)
            this.$el.find('.jmv-variable-list-item[data-id=' + this.$parent.val() + ']').addClass('highlighted');
    };

    this._createItemEvents = function(item) {
        item.$el.on('selected', () => {
            this.$el.trigger('selected-variable', item.variable);
        });
    };
};



export default VariableList;
