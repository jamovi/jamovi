'use strict';

import { translateFunction, translateNFunction } from '../common/i18n';
import { CtrlDef } from './optionsview';
import {  PropertySupplier } from './propertysupplier';


export class I18nSupport<P extends CtrlDef> extends PropertySupplier<P> {
        
    _i18nSource: { translate: translateFunction, translateN: translateNFunction };
    
    constructor(params: P) {
        super(params)

        this._i18nSource = null;
    }

    onI18nChanged?(): void;

    setI18nSource(supplier: { translate: translateFunction, translateN: translateNFunction }) {
        this._i18nSource = supplier;
        if (this.onI18nChanged)
            this.onI18nChanged();
    }

    translate(key: string, formats?: string | (string | number)[] | { [key: string]: string | number }, options?: { prefix: string, postfix: string }) : string {
        if (this._i18nSource === null)
            return key;

        return this._i18nSource.translate(key, formats, options);
    }

    translateN(key: string, plural: string, count: number, formats?: { [key: string]: (string|number), n?: (string|number) }) : string {
        if (this._i18nSource === null)
            return key;

        return this._i18nSource.translateN(key, plural, count, formats);
    }
}

export default I18nSupport;
