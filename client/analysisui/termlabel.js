'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const RequestDataSupport = require('./requestdatasupport');
const FormatDef = require('./formatdef');

const TermLabel = function(params) {

    GridOptionControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.$el = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-term"></div>');

    this.registerSimpleProperty("format", FormatDef.term);

    this.createItem = function() {
        let displayValue = FormatDef.term.toString(this.getValue());

        this.$label = $('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');

        this.$el.append(this.$label);
    };

    this.onOptionValueChanged = function(key, data) {
        if (this.$label) {
            let displayValue = FormatDef.term.toString(this.getValue());
            this.$label.text(displayValue);
        }
    };
};

module.exports = TermLabel;
