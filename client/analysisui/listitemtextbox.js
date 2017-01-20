'use strict';

var $ = require('jquery');
var _ = require('underscore');
var ListItemControl = require('./listitemcontrol');
var FormatDef = require('./formatdef');


var ListItemTextbox = function(params) {

    ListItemControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.string);

    this.onEmptyingView = function() {
        var $item = this.$el.find(".silky-option-input");
        $item.off("change");
    };

    this.onUpdateView = function(data, format, properties) {
        this.$el.find(".silky-option-input").val(format.toString(data));
    };

    this.onDisposed = function() {
        this.$el.find(".silky-option-input").off("change");
    };

    this.onRender = function(data, format, properties) {
        let value = '';
        if (format.isEmpty(data) === false)
            value = format.toString(data);

        this.$el.addClass("silky-list-item-textbox");

        var t = '<input class="silky-list-item silky-option-input" style="display: inline; width: 100%" type="text" value="' + value + '"';
        var inputPattern = this.getPropertyValue("inputPattern");
        if (inputPattern !== null)
            t += ' pattern="'+ inputPattern +'"';
        t += '>';
        var $item = $(t);

        $item.focus(() => {
            $item.select();
        } );

        $item.change((event) => {

            if ($item[0].validity.valid === false)
                $item.addClass("silky-options-option-invalid");
            else
                $item.removeClass("silky-options-option-invalid");

            var value = $item.val();
            value = format.parse(value);
            var index = this.getPropertyValue("valuekey");
            this.option.setValue(value, index);
        });

        this.$el.append($item);
    };

};

module.exports = ListItemTextbox;
