
'use strict';

const $ = require('jquery');
const _ = require('underscore');

const GridControl = require('./gridcontrol');
const ChildLayoutSupport = require('./childlayoutsupport');
const EnumPropertyFilter = require('./enumpropertyfilter');
const FormatDef = require('./formatdef');
const GridOptionControl = require('./gridoptioncontrol');
const Icons = require('./iconsupport');

const LayoutGroupView = function(params) {

    let isOptionControl = params.label === undefined;
    if (isOptionControl)
        GridOptionControl.extendTo(this, params);
    else
        GridControl.extendTo(this, params);

    if (isOptionControl === false)
        this.registerSimpleProperty("label", "");

    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline", "list-inline", "inline-list"], "list"));
    this.registerSimpleProperty("margin", "large", new EnumPropertyFilter(["small", "normal", "large", "none"], "large"));
    this.registerSimpleProperty("format", FormatDef.string);
    Icons.addSupport(this);

    this.style = this.getPropertyValue('style');

    let groupText = "";
    if (isOptionControl === false)
        groupText = this.getPropertyValue('label');

    if (groupText === null)
        groupText = "";

    let classes = groupText === "" ? "silky-control-label-empty" : "";
    this.$_subel = $('<div class="silky-control-label silky-control-margin-' + this.getPropertyValue("margin") + ' ' + classes + '" style="white-space: nowrap;"><span>' + groupText + '</span></div>');
    this.$el = this.$_subel;

    if (Icons.exists(this)) {
        this.$icons = Icons.get(this);
        let iconPosition = Icons.position(this);
        if (iconPosition === 'right')
            this.$_subel.append(this.$icons);
        else
            this.$_subel.prepend(this.$icons);
    }

    this.onPropertyChanged = function(name) {
        if (isOptionControl === false) {
            if (name === 'label')
                this.setLabel(this.getPropertyValue(name));
        }
        else {
            if (name === 'enable') {
                let disabled = this.getPropertyValue(name) === false;
                if (disabled)
                    this.$_subel.addClass('disabled-text');
                else
                    this.$_subel.removeClass('disabled-text');
            }
        }
    };

    if (isOptionControl === false) {
        this.setValue = function(value) {
            this.setPropertyValue("label", value);
        };
    }
    else {
        this.onOptionValueChanged = function(key, data) {
            let format = this.getPropertyValue('format');
            this.setLabel(format.toString(this.getValue()));
        };
    }

    this.setLabel = function(value) {
        if (value === null)
            value = '';

        this.$_subel.html('<span>' + value + '</span>');
        this.$_subel.trigger("contentchanged");

        if (value === "")
            this.$_subel.addClass("silky-control-label-empty");
        else
            this.$_subel.removeClass("silky-control-label-empty");
    };

    ChildLayoutSupport.extendTo(this);
};

module.exports = LayoutGroupView;
