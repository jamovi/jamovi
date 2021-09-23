
'use strict';

const $ = require('jquery');
const MeasureListItem = require('./measurelistitem');

const MeasureList = function(includeAuto) {
    this.includeAuto = includeAuto === undefined ? true : false;
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.$el = $('<div class="jmv-measure-list"></div>');

    this.$middle = $('<div class="middle"></div>').appendTo(this.$el);

    this.setParent = function($element) {
        if (this.$parent) {
            this.$parent.off('change', null, this._valueChanged);
        }

        this.$parent = $element;

        this._valueChanged();

        this.$parent.on('change', null, this, this._valueChanged);
    };

    this._valueChanged = () => {
        this.$el.find('.jmv-measure-list-item.highlighted').removeClass('highlighted');
        let val = this.$parent.val();
        this.$el.find('.jmv-measure-list-item[data-id=' + this.$parent.val() + ']').addClass('highlighted');
        let $element = this.$el.find('.jmv-measure-list-item.highlighted');
        if ($element.length > 0)
            $element[0].scrollIntoView(false);
    };

    this.populate = function() {
        this.$middle.empty();

        let item = null;

        if (this.includeAuto) {
            item = new MeasureListItem('none', _('Auto'));
            item.$el.appendTo(this.$middle);
            this._createItemEvents(item);
        }

        item = new MeasureListItem('nominal', _('Nominal'));
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('ordinal', _('Ordinal'));
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('continuous', _('Continuous'));
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('id', _('ID'));
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);
    };

    this._createItemEvents = function(item) {
        item.$el.on('selected', () => {
            this.$el.trigger('selected-measure-type', item.measureType);
        });
    };

    this.populate();
};



module.exports = MeasureList;
