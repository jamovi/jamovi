'use strict';

import { TranslateFunction } from '../common/i18n';
import { CtrlDef } from './optionsview';
import {  PropertySupplier } from './propertysupplier';

export class I18nSupport<P extends CtrlDef> extends PropertySupplier<P> {
        
    _i18nSource: { translate: TranslateFunction };
    
    constructor(params: P) {
        super(params)

        this._i18nSource = null;
    }

    onI18nChanged?(): void;

    setI18nSource(supplier: { translate: TranslateFunction }) {
        this._i18nSource = supplier;
        if (this.onI18nChanged)
            this.onI18nChanged();
    }

    translate(key: string) : string {
        if (this._i18nSource === null)
            return key;

        return this._i18nSource.translate(key);
    }
}

export default I18nSupport;
