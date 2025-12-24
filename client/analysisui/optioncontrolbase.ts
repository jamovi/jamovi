'use strict';

import GridControl, { GridControlProperties } from './gridcontrol';
import { ControlOption } from './optionsview';
import { isTemplateItemControl } from './templateitemcontrol';
import TitledGridControl from './titledgridcontrol';


export type OptionControlBaseProperties<T> = GridControlProperties & {
    value: T;
    name: string;
    isVirtual: boolean;
    valueKey: (string | number)[];

    changing: (event:any) => void;
    optionValueInserting: (event) => void;
    optionValueInserted: (event) => void;
    optionValueRemoving: (event) => void;
    optionValueRemoved: (event) => void;
    optionValueChanging: (event) => void;
    optionValueChanged: (event) => void;
}

export class OptionControlBase<T, V, P extends OptionControlBaseProperties<T>> extends TitledGridControl<P> {

    option: ControlOption<T>;
    protected valueId: string;

    constructor(params: P, parent) {
        super(params, parent);

        this.option = null;

        this._valueChanged = this._valueChanged.bind(this);
        this._valueInserted = this._valueInserted.bind(this);
        this._valueRemoved = this._valueRemoved.bind(this);
    }

    protected override registerProperties(properties: P) {
        super.registerProperties(properties);

        this.registerComplexProperty('value', this.getSourceValue, this.setSourceValue, 'value_changed');
        this.registerSimpleProperty('name', null);
        this.registerSimpleProperty('isVirtual', false);
        this.registerSimpleProperty('valueKey', []);
    }

    override onPropertyChanged<K extends keyof P>(property: K)  {
        if (this.isDisposed)
            return;

        if (property === 'valueKey' || property === 'itemKey') {
            this.onOptionValueChanging([], null);
            this.onOptionValueChanged([], null);
            this.firePropertyChangedEvent('value');
        }

        super.onPropertyChanged(property);
    }
    
    getValue(): V | null;
    getValue(key: any): any | null;
    getValue(key=null): any | null {
        return this.getSourceValue(key);
    }

    getSourceValue(): T | null;
    getSourceValue(key: any): any | null;
    getSourceValue(key=null): any | null {
        return this.getOption().getValue(this.getFullKey(key));
    }

    value(): V | null;
    value(key: any): any | null;
    value(key=null): any | null {
        return this.getValue(key);
    }

    setSourceValue(value: T): void;
    setSourceValue(value: any, key: any): void;
    setSourceValue(value: any, key: any, insert: boolean): void;
    setSourceValue(value: any, key=[], insert=false) {
        let event = { value: value, key: key, insert: insert, cancel: false };

        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('changing', event);

        event.key = this.getFullKey(key);

        if (event.cancel === false) {
            let option = this.getOption();
            option.runInEditScope(() => {
                this.runInEditScope(() => {
                    if (event.insert)
                        option.insertValueAt(event.value, event.key);
                    else
                        option.setValue(event.value, event.key);
                });
            });
        }
    }

    setValue(value: V): void;
    setValue(value: any, key: any): void;
    setValue(value: any, key: any, insert: boolean): void
    setValue(value: any, key=[], insert=false) {
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
        let datas ={ key, data, cancel:false };
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueChanging', datas );
        return !datas.cancel;
    }

    onOptionValueChanged(key: (string | number)[], data) {
        let datas ={ key, data };
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueChanged', datas );
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
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueInserted', datas );
    }

    onOptionValueInserting(key, data) {
        let datas ={ key, data, cancel: false } 
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueInserting', datas );
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
        let datas ={ key, data, cancel: false };
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueRemoving', datas );
        return !datas.cancel;
    }

    onOptionValueRemoved(key, data) {
        let datas ={ key, data };
        let emitter = this as OptionControlBase<T, V, OptionControlBaseProperties<T>>;
        emitter.emit('optionValueRemoved', datas );
    }

    setOption(option: ControlOption<T>, valueKey=null) {
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

    override onDisposed() {
        super.onDisposed();

        if (this.el)
            this.el.innerHTML = '';
        this.setOption(null);
    }

    getOption(): ControlOption<T> {
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
            let parentCtrl = this._parentControl;
            while (parentCtrl !== null) {
                if (parentCtrl.getValueKey && isTemplateItemControl(prevCtrl)) {
                    bKey = parentCtrl.getValueKey().concat(prevCtrl.getPropertyValue('itemKey')).concat(bKey);
                    break;
                }
                prevCtrl = parentCtrl;
                parentCtrl = parentCtrl._parentControl;
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

export default OptionControlBase;
