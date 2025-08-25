'use strict';

import ControlBase, { ControlBaseProperties } from "./controlbase";
import { Control, CtrlDef } from "./optionsview";

type TemplateItemControlType = {
    getItemKey: () => any;
};

export type TemplateItemControlProperties = ControlBaseProperties & {
    itemKey: (number | string)[];
};

export const isTemplateItemControlProperties = function(obj: any): obj is TemplateItemControlProperties {
    return obj !== null && Array.isArray(obj.itemKey);
}

export const isTemplateItemControl = function(obj: any): obj is ControlBase<TemplateItemControlProperties> {
    return obj !== null && obj instanceof ControlBase && isTemplateItemControlProperties(obj.params);
}

export const TemplateItemControl = function<P extends TemplateItemControlProperties, T extends ControlBase<P>>(obj: T) : T & TemplateItemControlType {

    if (obj.hasProperty("itemKey") === false || obj.hasProperty("_templateInfo") === false)
        throw "An item control must have an itemkey and be templated.";

    let ctrl = {
        getItemKey: function() {
            let self = this as ControlBase<P>;
            let iKey = null;
            let templateInfo = self.getTemplateInfo();
            if (templateInfo !== null) {
                let prevCtrl = self;
                let parentCtrl = self._parentControl;
                while (parentCtrl !== null) {
                    if (parentCtrl.getValueKey && prevCtrl.hasProperty("itemKey")) {
                        iKey = parentCtrl.getValueKey().concat(prevCtrl.getPropertyValue("itemKey"));
                        break;
                    }
                    prevCtrl = parentCtrl;
                    parentCtrl = parentCtrl._parentControl;
                }
            }
            return iKey;
        }
    };

    return Object.assign(obj, ctrl);
};

export default TemplateItemControl;
