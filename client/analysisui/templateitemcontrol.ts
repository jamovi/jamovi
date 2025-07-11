'use strict';

import { Control, CtrlDef } from "./optionsview";

type TemplateItemControlType = {
    getItemKey: () => any;
};

export type TemplateItemControlProperties = CtrlDef & {
    _parentControl: any;
    itemKey: (number | string)[];
};

export const TemplateItemControl = function<P extends TemplateItemControlProperties, T extends Control<P>>(obj: T) : T & TemplateItemControlType {

    if (obj.hasProperty("itemKey") === false || obj.hasProperty("_templateInfo") === false)
        throw "An item control must have an itemkey and be templated.";

    let ctrl = {
        getItemKey: function() {
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
        }
    };

    return Object.assign(obj, ctrl);
};

export default TemplateItemControl;
