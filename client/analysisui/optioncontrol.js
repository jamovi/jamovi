'use strict';

var OptionControlBase = require('./optioncontrolbase');
var EnumPropertyFilter = require('./enumpropertyfilter');
var SuperClass = require('../common/superclass');

var OptionControl = function(params) {

    OptionControlBase.extendTo(this, params);

    this._optProperties = [];
    //mode: localOverride - if the property is defined within the control it overrides the property in the optionName.
    //      localPush -     if the property within the control is changed, the value is pushed to the corresponding property in the option.
    //
    // Will treat the absence of mode as 'localPush' is the option property name is the same as the control property name. If they are
    // different it will use 'localOverride' using the ussumption that the difference in name infers a subtle difference in meaning.
    this.registerOptionProperty = function(optPropertyName, overrideName, mode) {
        if ( overrideName === undefined)
            overrideName = optPropertyName;
        if (mode === undefined)
            mode = optPropertyName === overrideName ? 'localPush' : 'localOverride';

        this.registerSimpleProperty(overrideName, null);
        this._optProperties.push({ optPropertyName: optPropertyName, overrideName: overrideName, mode: mode });
    };

    this.registerSimpleProperty('optionName', null);
    this.registerSimpleProperty('enable', true);
    this.registerOptionProperty('title', 'label');
    this.registerOptionProperty('default', 'defaultValue');
    this.registerSimpleProperty('style', 'list', new EnumPropertyFilter(['list', 'inline', 'list-inline', 'inline-list'], 'list'));

    this.registerSimpleProperty('optionPart', null);

    this.setEnabled = function(value) {
        this.setPropertyValue('enable', value);
    };

    this._override('onPropertyChanged', (baseFunction, propertyName) => {
        baseFunction.call(this, propertyName);
        for (let overridePropertyInfo of this._optProperties) {
            if (overridePropertyInfo.mode === 'localPush' && propertyName === overridePropertyInfo.overrideName) {
                let option = this.getOption();
                let properties = this.properties[overridePropertyInfo.overrideName];
                option.setProperty(overridePropertyInfo.optPropertyName, properties.value, this.getFullKey(), this.getPropertyValue('optionPart'));
            }
        }
    });

    this._override('setOption', (baseFunction, option, valueKey) => {
        baseFunction.call(this, option, valueKey);
        if (option === null)
            return;

        for (let overridePropertyInfo of this._optProperties) {
            let properties = this.properties[overridePropertyInfo.overrideName];
            let optionProperties = option.getProperties(this.getFullKey(), this.getPropertyValue('optionPart'));
            let initialValue = optionProperties[overridePropertyInfo.optPropertyName];
            if (initialValue === undefined && overridePropertyInfo.mode === 'localPush')
                option.setProperty(overridePropertyInfo.optPropertyName, properties.value, this.getFullKey(), this.getPropertyValue('optionPart'));
            else {
                //Updates any optionProperties that are data-bindings. This can only be determined when
                //the option has been assigned (unlike simpleProperties)
                let dataBound = this.isValueDataBound(initialValue);
                if (dataBound && ! properties.binding) {
                    if (dataBound) {
                        properties.binding = initialValue;
                        properties.value = null;
                    }
                }
            }
        }
    });

    this._override('getPropertyValue', (baseFunction, property) => {
        let value = baseFunction.call(this, property);
        for (let overridePropertyInfo of this._optProperties) {
            if (property === overridePropertyInfo.overrideName) {
                if (value === null) {
                    let option = this.getOption();
                    let optionProperties = option.getProperties(this.getFullKey(), this.getPropertyValue('optionPart'));
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
