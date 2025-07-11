'use strict';

import EnumPropertyFilter from './enumpropertyfilter';
import I18nSupport from './i18nsupport';
import { CtrlDef, Control } from './optionsview';

export enum Margin {
    Small = "small",
    Normal = "normal",
    Large = "large",
    None = "none"
}

export type ControlBaseProperties = CtrlDef & {
    stage: 0 | 1 | 2;  //0 - release, 1 - development, 2 - proposed
    margin: Margin;
}

export type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

export class ControlBase<P extends ControlBaseProperties> extends I18nSupport<P> implements Control<P> {
    isDisposed: boolean;

    constructor(params: P) {
        super(params);

        if (params._parentControl === undefined)
            throw "Every control requires '_parentControl to be assigned.'";
    
        this.isDisposed = false;
    }

    protected override registerProperties(properties: P) {
        super.registerProperties(properties);

        this.registerSimpleProperty("stage", 0); //0 - release, 1 - development, 2 - proposed
        this.registerSimpleProperty("margin", Margin.Normal, new EnumPropertyFilter(Margin, Margin.Normal));
    }

    getTemplateInfo() {

        if (this.hasProperty('_templateInfo'))
            return this.getPropertyValue('_templateInfo');

        let parent = this.getPropertyValue('_parentControl');
        if (parent === null)
            return null;

        return parent.getTemplateInfo();
    }

    getControls?() : any[];

    dispose() {
        if (this.isDisposed)
            return;

        this.isDisposed = true;
        
        this.onDisposed();

        if (this.getControls) {
            let children = this.getControls();
            for (let i = 0; i < children.length; i++)
                children[i].dispose();
        }
    }

    onDisposed() {
        this.emit('disposing');
    }

    getTranslatedProperty<K extends StringKeys<P>>(property: K): string {
        let value = this.getPropertyValue(property);
        if (value !== null && value !== undefined && typeof value != 'string') {
            throw 'Not a valid property to translate';
        }
        return this.translate(value);
    }
}


export default ControlBase;
