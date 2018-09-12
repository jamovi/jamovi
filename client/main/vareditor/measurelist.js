
'use strict';

const $ = require('jquery');
const MeasureListItem = require('./measurelistitem');

const MeasureList = function() {
    this.isScrollTarget = function(target) {
        return target === this.$middle[0];
    };

    this.$el = $('<div class="jmv-measure-list"></div>');

    this.$middle = $('<div class="middle"></div>').appendTo(this.$el);

    this.populate = function() {
        this.$middle.empty();

        let item = new MeasureListItem('none', 'Auto');
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('nominal', 'Nominal');
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('ordinal', 'Ordinal');
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('continuous', 'Continuous');
        item.$el.appendTo(this.$middle);
        this._createItemEvents(item);

        item = new MeasureListItem('id', 'ID');
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
