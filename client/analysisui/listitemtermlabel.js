'use strict';

var $ = require('jquery');
var _ = require('underscore');
var ListItemControl = require('./listitemcontrol');
var FormatDef = require('./formatdef');


var ListItemTermLabel = function(params) {

    ListItemControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.term);

    this.onUpdateView = function(data, format, properties) {
        var $label = this.$el.find(".silky-list-item-value");
        $label.empty();
        if (data !== null)
            $label.append(format.toString(data));
    };

    this.onRender = function(data, format, properties) {
        var $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');

        var displayValue = "";
        if (data !== null)
            displayValue = format.toString(data);
        $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');

        this.$el.append($item);
    };
};

module.exports = ListItemTermLabel;
