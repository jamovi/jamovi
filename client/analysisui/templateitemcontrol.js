'use strict';

const SuperClass = require('../common/superclass');

const TemplateItemControl = function() {

    if (this.hasProperty("itemKey") === false || this.hasProperty("_templateInfo") === false)
        throw "An item control must have an itemkey and be templated.";

    this.getItemKey = function() {
        let iKey = null;
        let templateInfo = this.getTemplateInfo();
        if (templateInfo !== null) {
            let prevCtrl = this;
            let parentCtrl = this.getPropertyValue("_parentControl");
            while (parentCtrl !== null) {
                if (parentCtrl.getValueKey && prevCtrl.hasProperty("itemKey")) {
                    iKey = parentCtrl.getValueKey().concat(prevCtrl.getPropertyValue("itemKey"));
                    break;
                }
                prevCtrl = parentCtrl;
                parentCtrl = parentCtrl.getPropertyValue("_parentControl");
            }
        }
        return iKey;
    };
};

SuperClass.create(TemplateItemControl);

module.exports = TemplateItemControl;
