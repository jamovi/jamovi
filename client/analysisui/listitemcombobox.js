'use strict';

var $ = require('jquery');
var _ = require('underscore');
var ListItemControl = require('./listitemcontrol');
var FormatDef = require('./formatdef');


var ListItemCombobox = function(params) {

    ListItemControl.extendTo(this, params);

    this.registerSimpleProperty("format", FormatDef.string);

    this.onEmptyingView = function() {
        var $item = this.$el.find(".silky-option-input");
        $item.off("change", this.onUserChange);
    };

    this.onDisposed = function() {
        this.$el.find(".silky-option-input").off("change", this.onUserChange);
    };

    this.onUpdateView = function(data, format, properties) {
        var select = this.$el.find(".silky-option-input")[0];
        var options = this.getPropertyValue('options');
        var index = -1;
        for (var i = 0; i < options.length; i++) {
            if (options[i] === data) {
                index = i;
                break;
            }
        }
        if (index !== -1)
            select.selectedIndex = index;
    };

    var self = this;
    this.onUserChange = function(event) {
        var options = self.getPropertyValue("options");
        var select = self.$el.find(".silky-option-input")[0];
        var option = options[select.selectedIndex];
        var index = self.getPropertyValue('valuekey');
        self.option.setValue(option, index);
    };

    this.onRender = function(data, format, properties) {

        var $item = null;

        var options = this.getPropertyValue("options");

        var selectedIndex = -1;
        var t = '<select class="silky-list-item silky-option-input">';
        for (var i = 0; i < options.length; i++) {
            t += '<option>' + options[i] + '</option>';
            if (options[i] === data)
                selectedIndex = i;
        }
        t += '</select>';


        $item = $(t);
        if (selectedIndex !== -1)
            $item[0].selectedIndex = selectedIndex;

        $item.on("change", this.onUserChange);

        this.$el.append($item);
    };

};

module.exports = ListItemCombobox;
