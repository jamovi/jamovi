'use strict';

var _ = require('underscore');
var OptionControlBase = require('./optioncontrolbase');
var EnumPropertyFilter = require('./enumpropertyfilter');
var SuperClass = require('../common/superclass');

var OptionControl = function(params) {

    OptionControlBase.extendTo(this, params);

    this._optProperties = [];
    this.registerOptionProperty = function(optPropertyName, overrideName) {
        if ( overrideName === undefined)
            overrideName = optPropertyName;
        this.registerSimpleProperty(overrideName, null);
        this._optProperties.push({ optPropertyName: optPropertyName, overrideName: overrideName });
    };

    this.registerSimpleProperty("optionName", null);
    this.registerSimpleProperty("enable", true);
    this.registerOptionProperty("title", "label");
    this.registerSimpleProperty("style", "list", new EnumPropertyFilter(["list", "inline", "list-inline", "inline-list"], "list"));

    this.registerSimpleProperty("optionPart", null);

    this.setEnabled = function(value) {
        this.setPropertyValue("enable", value);
    };


    this._override("getPropertyValue", (baseFunction, property) => {
        let value = baseFunction.call(this, property);
        for (let i = 0; i < this._optProperties.length; i++) {
            let overridePropertyInfo = this._optProperties[i];
            if (property === overridePropertyInfo.overrideName) {
                if (value === null) {
                    let option = this.getOption();
                    let optionProperties = option.getProperties(this.getFullKey(), this.getPropertyValue("optionPart"));
                    if (optionProperties[overridePropertyInfo.optPropertyName] !== undefined)
                        value = optionProperties[overridePropertyInfo.optPropertyName];
                }
            }
        }
        return value;
    });

};

SuperClass.create(OptionControl);

module.exports = OptionControl;
