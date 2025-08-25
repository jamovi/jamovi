'use strict';

import OptionControlBase, { OptionControlBaseProperties } from './optioncontrolbase';
import EnumPropertyFilter from './enumpropertyfilter';
import { ControlOption } from './optionsview';
import { GridControlProperties } from './gridcontrol';
import { ChildSupportProperties, ComplexLayoutStyle } from './childlayoutsupport';

export type OptionControlProperties<T> = ChildSupportProperties & OptionControlBaseProperties<T> &  {
    optionName: string;
    optionPart: string;
    enable: boolean;
    label: string;
    defaultValue: T;
}

enum OverrideMode { 
    LOCAL_PUSH = 'localPush',
    LOCAL_OVERRIDE = 'localOverride'
}

type InferType<T> = T extends OptionControlProperties<infer A> ? A : never;
export class OptionControl<P extends OptionControlProperties<T>, V=InferType<P>, T=InferType<P>> extends OptionControlBase<T,V,P> {

    //_optProperties: { optPropertyName: string | number | symbol, overrideName: string | number | symbol, mode: OverrideMode }[];

    constructor(params: P, parent) {
        super(params, parent);
    }

    protected override registerProperties(properties: P) {
        super.registerProperties(properties);

        this.registerSimpleProperty('optionName', null);
        this.registerSimpleProperty('enable', true);
        this.registerOptionProperty('label', 'title');
        this.registerOptionProperty('defaultValue', 'default');
        this.registerSimpleProperty('style', ComplexLayoutStyle.List, new EnumPropertyFilter(ComplexLayoutStyle, ComplexLayoutStyle.List));

        this.registerSimpleProperty('optionPart', null);
    }

    override onPropertyChanged<K extends keyof P>(propertyName: K)  {
        super.onPropertyChanged(propertyName);
        for (let overridePropertyInfo of this._optProperties) {
            if (overridePropertyInfo.mode === OverrideMode.LOCAL_PUSH && propertyName === overridePropertyInfo.overrideName) {
                let option = this.getOption();
                let properties = this.properties[overridePropertyInfo.overrideName];
                option.setProperty(overridePropertyInfo.optPropertyName, properties.value, this.getFullKey(), this.getPropertyValue('optionPart'));
            }
        }
    }

    override getPropertyValue<K extends keyof P>(property: K) {
        let value = super.getPropertyValue(property);
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
    }

    //mode: localOverride - if the property is defined within the control it overrides the property in the optionName.
    //      localPush -     if the property within the control is changed, the value is pushed to the corresponding property in the option.
    //
    // Will treat the absence of mode as 'localPush' is the option property name is the same as the control property name. If they are
    // different it will use 'localOverride' using the ussumption that the difference in name infers a subtle difference in meaning.
    registerOptionProperty<K extends keyof P>(overrideName: K, optPropertyName: string | number | symbol = null,  mode=null) {
        if (this._optProperties === undefined)
            this._optProperties = [];

        if ( optPropertyName === null)
            optPropertyName = overrideName;

        if (mode === null)
            mode = optPropertyName === overrideName ? OverrideMode.LOCAL_PUSH : OverrideMode.LOCAL_OVERRIDE;

        this.registerSimpleProperty(overrideName, null);
        this._optProperties.push({ optPropertyName: optPropertyName, overrideName: overrideName, mode: mode });
    }

    setEnabled(value) {
        this.setPropertyValue('enable', value);
    }

    override setOption(option: ControlOption<T>, valueKey=null) {
        super.setOption(option, valueKey);

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
    }
}


export type GridOptionControlProperties<T> = OptionControlProperties<T> & GridControlProperties;

export default OptionControl;
