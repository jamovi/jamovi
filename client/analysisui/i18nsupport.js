'use strict';

const SuperClass = require('../common/superclass');

const I18nSupport = function() {

    this._i18nSource = null;
    this.setI18nSource = function(supplier) {
        this._i18nSource = supplier;
        if (this.onI18nChanged)
            this.onI18nChanged();
    };

    this.translate = function(key) {
        if (this._i18nSource === null)
            return key;

        return this._i18nSource.translate(key);
    };
};

SuperClass.create(I18nSupport);

module.exports = I18nSupport;
