'use strict';

import { PropertySupplier } from './propertysupplier';

type Constructor<T = {}> = new (...params: any[]) => T;
export function I18nSupport<TBase extends Constructor<PropertySupplier>>(Base: TBase) {
    return class extends Base {
        
        _i18nSource: { translate: (key: string) => string };
        
        constructor(...args: any[]) {
            super(args[0])

            this._i18nSource = null;
        }

        onI18nChanged?(): void;

        setI18nSource(supplier: { translate: (key: string) => string }) {
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
}

export default I18nSupport;
