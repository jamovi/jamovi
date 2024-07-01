'use strict';

const SuperClass = require('../common/superclass');
const ControlBase = require('./controlbase');

const OptionControlBase = function(params) {

    ControlBase.extendTo(this, params);

    this.option = null;

    this.getValue = function(key) {
        return this.getSourceValue(key);
    };

    this.getSourceValue = function(key) {
        return this.getOption().getValue(this.getFullKey(key));
    };

    this.value = function(key) {
        return this.getValue(key);
    };

    this.setSourceValue = function(value, key, insert) {
        if (key === undefined)
            key = [];

        if (insert === undefined)
            insert = false;

        let event = { value: value, key: key, insert: insert, cancel: false };

        this.trigger('changing', event);

        event.key = this.getFullKey(key);

        if (event.cancel === false) {
            let option = this.getOption();
            option.beginEdit();
            this.beginPropertyEdit();
            if (event.insert)
                option.insertValueAt(event.value, event.key);
            else
                option.setValue(event.value, event.key);
            this.endPropertyEdit();
            option.endEdit();
        }
    };

    this.setValue = function(value, key, insert) {
        this.setSourceValue(value, key, insert);
    };

    this.registerComplexProperty('value', this.getValue, this.setValue, 'value_changed');
    this.registerSimpleProperty('name', null);
    this.registerSimpleProperty('isVirtual', false);

    this.getValueId = function() {
        let valueId = this.valueId;
        if (valueId)
            return valueId;

        return null;
    };

    this._override('onPropertyChanged', (baseFunction, property) => {
        if (this.isDisposed)
            return;

        if (property === 'valueKey' || property === 'itemKey') {
            if (this.onOptionValueChanged)
                this.onOptionValueChanged([], null);
            this.firePropertyChangedEvent('value');
        }

        if (baseFunction !== null)
            baseFunction.call(this, property);
    });

    this._valueChanged = function(key, data) {
        if (this.isDisposed === false && this._isKeyAffecting(key)) {
            if (this.onOptionValueChanged)
                this.onOptionValueChanged(this.getRelativeKey(key), data);
            this.firePropertyChangedEvent('value');
        }
    };

    this._valueInserted = function(key, data) {
        if (this.isDisposed === false && this._isKeyAffecting(key)) {
            let relKey = this.getRelativeKey(key);
            if (relKey.length > 0) {
                if (this.onOptionValueInserted)
                    this.onOptionValueInserted(relKey, data);
                this.firePropertyChangedEvent('value');
            }
        }
    };

    this._valueRemoved = function(key, data) {
        if (this.isDisposed === false && this._isKeyAffecting(key)) {
            let relKey = this.getRelativeKey(key);
            if (relKey.length > 0) {
                if (this.onOptionValueRemoved)
                    this.onOptionValueRemoved(relKey, data);
                this.firePropertyChangedEvent('value');
            }
        }
    };

    this.setOption = function(option, valueKey) {
        if (this.option !== null) {
            this.option.source.off('valuechanged', this._valueChanged, this);
            this.option.source.off('valueinserted', this._valueInserted, this);
            this.option.source.off('valueremoved', this._valueRemoved, this);
        }

        if (valueKey !== null && valueKey !== undefined)
            this.setPropertyValue('valueKey', valueKey);

        this.option = option;

        if (this.option !== null) {
            this.option.source.on('valuechanged', this._valueChanged, this);
            this.option.source.on('valueinserted', this._valueInserted, this);
            this.option.source.on('valueremoved', this._valueRemoved, this);
        }

        if (this.onOptionSet)
            this.onOptionSet(option);

        if (option !== null)
            this._valueChanged(this.getValueKey(), this.getValue());
    };


    this._override('onDisposed', (baseFunction) => {
        if (baseFunction !== null)
            baseFunction.call(this);
        if (this.$el)
            this.$el.empty();
        this.setOption(null);
    });


    this.getOption = function() {
        if (this.option !== null)
            return this.option;

        let templateInfo = this.getTemplateInfo();
        if (templateInfo !== null)
            return templateInfo.parent.getOption();

        throw 'This control has no connection to an option';
    };

    this.registerSimpleProperty('valueKey', []);

    this._isKeyAffecting = function(fullkey) {
        let needsUpdate = fullkey.length === 0;
        if (needsUpdate === false) {
            let valueKey = this.getValueKey();
            needsUpdate = valueKey.length === 0;
            if (needsUpdate === false) {
                let diff = this._keyDifference(fullkey, valueKey);

                let d = diff[diff.length - 1];
                if (d !== null && d === 0)
                    needsUpdate = true;
            }
        }

        return needsUpdate;
    };

    this._keyDifference = function(fullkey, valueKey) {
        let diff = [];
        for (let i = 0; i < valueKey.length; i++) {
            if (i >= fullkey.length)
                break;

            let a1 = fullkey[i];
            let b1 = valueKey[i];

            if (typeof a1 !== typeof b1)
                break;

            let f = 0;
            if (typeof a1 === 'string') {
                if (a1 !== b1)
                    f = null;
            }
            else {
                f = b1 - a1;
            }

            diff.push(f);
            if (f !== 0)
                break;
        }

        return diff;
    };

    this.getFullKey = function(relativeKey) {
        let valueKey = this.getValueKey();
        if (relativeKey === undefined || relativeKey === null || relativeKey.length === 0)
            return valueKey;

        return valueKey.concat(relativeKey);
    };

    this.getValueKey = function() {
        let bKey =  this.getPropertyValue('valueKey').slice(0);
        let templateInfo = this.getTemplateInfo();
        if (templateInfo !== null) {
            let prevCtrl = this;
            let parentCtrl = this.getPropertyValue('_parentControl');
            while (parentCtrl !== null) {
                if (parentCtrl.getValueKey && prevCtrl.hasProperty('itemKey')) {
                    bKey = parentCtrl.getValueKey().concat(prevCtrl.getPropertyValue('itemKey')).concat(bKey);
                    break;
                }
                prevCtrl = parentCtrl;
                parentCtrl = parentCtrl.getPropertyValue('_parentControl');
            }
        }
        return bKey;
    };

    this.getRelativeKey = function(fullKey) {
        let valueKey = this.getValueKey();
        if (valueKey.length === 0)
            return fullKey;

        if (valueKey.length === fullKey.length)
            return [];

        return fullKey.slice(valueKey.length, fullKey.length);
    };
};

SuperClass.create(OptionControlBase);

module.exports = OptionControlBase;
