'use strict';

const SuperClass = require('../common/superclass');
const PropertySupplier = require('./propertysupplier');
const EnumPropertyFilter = require('./enumpropertyfilter');
const I18nSupport = require('./i18nsupport');

const ControlBase = function(params) {

    if (params._parentControl === undefined)
        throw "Every control requires '_parentControl to be assigned.'";

    PropertySupplier.extendTo(this, params);
    I18nSupport.extendTo(this);

    this.registerSimpleProperty("stage", 0); //0 - release, 1 - development, 2 - proposed
    this.registerSimpleProperty("margin", "normal", new EnumPropertyFilter(["small", "normal", "large", "none"], "normal"));

    this.getTemplateInfo = function() {

        if (this.hasProperty('_templateInfo'))
            return this.getPropertyValue('_templateInfo');

        let parent = this.getPropertyValue('_parentControl');
        if (parent === null)
            return null;

        return parent.getTemplateInfo();
    };

    this.isDisposed = false;

    this.dispose = function() {
        if (this.isDisposed)
            return;

        this.isDisposed = true;
        if (this.onDisposed)
            this.onDisposed();

        if (this.getControls) {
            let children = this.getControls();
            for (let i = 0; i < children.length; i++)
                children[i].dispose();
        }
    };

    this.getTranslatedProperty = function(property) {
        let value = this.getPropertyValue(property);
        if (typeof value != 'string') {
            throw 'Not a valid property to translate';
        }
        value = this.translate(value);
        return value;
    };
};

SuperClass.create(ControlBase);

module.exports = ControlBase;
