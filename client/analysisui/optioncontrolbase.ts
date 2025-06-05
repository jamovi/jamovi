'use strict';

import ControlBase from './controlbase';

type Constructor<T = {}> = new (...params: any[]) => T;

export function createOptionControlBase(params) {
    let classe = OptionControlBase(ControlBase);
    return new classe(params);
}

export function OptionControlBase<TBase extends Constructor<ControlBase>>(Base: TBase) {

    return class extends Base {
        option: any;

        constructor(...args: any[]) {
            super(args[0]);

            this.option = null;

            this._valueChanged = this._valueChanged.bind(this);
            this._valueInserted = this._valueInserted.bind(this);
            this._valueRemoved = this._valueRemoved.bind(this);
        }

        protected registerProperties(properties) {
            super.registerProperties(properties);

            this.registerComplexProperty('value', this.getValue, this.setValue, 'value_changed');
            this.registerSimpleProperty('name', null);
            this.registerSimpleProperty('isVirtual', false);
            this.registerSimpleProperty('valueKey', []);
        }

        onPropertyChanged(property)  {
            if (this.isDisposed)
                return;

            if (property === 'valueKey' || property === 'itemKey') {
                this.onOptionValueChanging([], null);
                this.onOptionValueChanged([], null);
                this.firePropertyChangedEvent('value');
            }

            super.onPropertyChanged(property);
        }
        
        getValue(key=null) {
            return this.getSourceValue(key);
        }

        getSourceValue(key=null) {
            return this.getOption().getValue(this.getFullKey(key));
        }

        value(key=null) {
            return this.getValue(key);
        }

        setSourceValue(value, key=[], insert=false) {
            let event = { value: value, key: key, insert: insert, cancel: false };

            this.emit('changing', event);

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
        }

        setValue(value, key=[], insert=false) {
            this.setSourceValue(value, key, insert);
        }

        getValueId() {
            let valueId = this.valueId;
            if (valueId)
                return valueId;

            return null;
        }

        _valueChanged(key, data) {
            if (this.isDisposed === false && this._isKeyAffecting(key)) {
                let relKey = this.getRelativeKey(key);
                if (this.onOptionValueChanging(relKey, data))
                    this.onOptionValueChanged(relKey, data);
                this.firePropertyChangedEvent('value');
            }
        }

        onOptionValueChanging(key, data) {
            let datas ={ key, data, cancel:false } 
            this.emit('optionValueChanging', datas );
            return !datas.cancel;
        }

        onOptionValueChanged(key, data) {
            let datas ={ key, data } 
            this.emit('optionValueChanged', datas );
        }

        _valueInserted(key, data) {
            if (this.isDisposed === false && this._isKeyAffecting(key)) {
                let relKey = this.getRelativeKey(key);
                if (relKey.length > 0) {
                    if (this.onOptionValueInserting(relKey, data))
                        this.onOptionValueInserted(relKey, data);
                    this.firePropertyChangedEvent('value');
                }
            }
        }

        onOptionValueInserted(key, data) {
            let datas = { key, data };
            this.emit('optionValueInserted', datas );
        }

        onOptionValueInserting(key, data) {
            let datas ={ key, data, cancel: false } 
            this.emit('optionValueInserting', datas );
            return !datas.cancel;
        }

        _valueRemoved(key, data) {
            if (this.isDisposed === false && this._isKeyAffecting(key)) {
                let relKey = this.getRelativeKey(key);
                if (relKey.length > 0) {
                    if (this.onOptionValueRemoving(relKey, data))
                        this.onOptionValueRemoved(relKey, data);
                    this.firePropertyChangedEvent('value');
                }
            }
        }

        onOptionValueRemoving(key, data) {
            let datas ={ key, data, cancel: false } 
            this.emit('optionValueRemoving', datas );
            return !datas.cancel;
        }

        onOptionValueRemoved(key, data) {
            let datas ={ key, data } 
            this.emit('optionValueRemoved', datas );
        }

        setOption(option, valueKey=null) {
            if (this.option !== null) {
                this.option.source.off('valuechanged', this._valueChanged);
                this.option.source.off('valueinserted', this._valueInserted);
                this.option.source.off('valueremoved', this._valueRemoved);
            }

            if (valueKey !== null && valueKey !== undefined)
                this.setPropertyValue('valueKey', valueKey);

            this.option = option;

            if (this.option !== null) {
                this.option.source.on('valuechanged', this._valueChanged);
                this.option.source.on('valueinserted', this._valueInserted);
                this.option.source.on('valueremoved', this._valueRemoved);
            }

            if (this.onOptionSet)
                this.onOptionSet(option);

            if (option !== null)
                this._valueChanged(this.getValueKey(), this.getValue());
        }

        onOptionSet(option) {

        }

        onDisposed() {
            super.onDisposed();

            if (this.el)
                this.el.innerHTML = '';
            this.setOption(null);
        }

        getOption() {
            if (this.option !== null)
                return this.option;

            let templateInfo = this.getTemplateInfo();
            if (templateInfo !== null)
                return templateInfo.parent.getOption();

            throw 'This control has no connection to an option';
        }

        _isKeyAffecting(fullkey) {
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
        }

        _keyDifference(fullkey, valueKey) {
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
        }

        getFullKey(relativeKey=null) {
            let valueKey = this.getValueKey();
            if (relativeKey === undefined || relativeKey === null || relativeKey.length === 0)
                return valueKey;

            return valueKey.concat(relativeKey);
        }

        getValueKey() {
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
        }

        getRelativeKey(fullKey) {
            let valueKey = this.getValueKey();
            if (valueKey.length === 0)
                return fullKey;

            if (valueKey.length === fullKey.length)
                return [];

            return fullKey.slice(valueKey.length, fullKey.length);
        }
    }
}

export default OptionControlBase;
