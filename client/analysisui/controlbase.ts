'use strict';

import { PropertySupplier } from './propertysupplier';
import EnumPropertyFilter from './enumpropertyfilter';
import I18nSupport from './i18nsupport';

export class ControlBase extends I18nSupport(PropertySupplier) {
    isDisposed: boolean;

    constructor(params) {
        super(params);

        if (params._parentControl === undefined)
            throw "Every control requires '_parentControl to be assigned.'";
    
        this.isDisposed = false;
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("stage", 0); //0 - release, 1 - development, 2 - proposed
        this.registerSimpleProperty("margin", "normal", new EnumPropertyFilter(["small", "normal", "large", "none"], "normal"));
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

    getTranslatedProperty(property: string): string {
        let value = this.getPropertyValue(property);
        if (value !== null && value !== undefined && typeof value != 'string') {
            throw 'Not a valid property to translate';
        }
        value = this.translate(value);
        return value;
    }
}

export default ControlBase;
