
'use strict';

const DefaultControls = require('./defaultcontrols');

const checkForLayoutUpgrade = function(layout) {

    if (layout.jus === undefined || layout.jus === '1.0') {
        applyUpgrade(layout, null, layoutUpgrade_2_0);
        layout.jus = "2.0";
    }

};

const applyUpgrade = function(ctrl, parent, upgrade) {

    let upgradeCtrl = upgrade(ctrl, parent);

    if (Array.isArray(ctrl.controls)) {
        for (let i = 0; i < ctrl.controls.length; i++)
            ctrl.controls[i] = applyUpgrade(ctrl.controls[i], ctrl, upgrade);
    }

    return upgradeCtrl;
};


const layoutUpgrade_2_0 = function(ctrl, parent) {
    if ( ! ctrl.type)
        return ctrl;

    let upgradedCtrl = ctrl;

    if (ctrl.optionId !== undefined) {
        ctrl.optionName = ctrl.optionId;
        delete ctrl.optionId;
    }

    if (ctrl.type === DefaultControls.VariableTargetListBox || ctrl.type === DefaultControls.TargetListBox) {
        if (ctrl.columns !== undefined) {
            for (let c = 0; c < ctrl.columns.length; c++) {
                let column = ctrl.columns[c];
                if (column.template === undefined) {

                    let template = { type: column.type };
                    delete column.type;

                    if (column.format !== undefined) {
                        template.format = column.format;
                        delete column.format;
                    }

                    if (column.horizontalAlignment !== undefined) {
                        template.horizontalAlignment = column.horizontalAlignment;
                        delete column.horizontalAlignment;
                    }

                    if (column.verticalAlignment !== undefined) {
                        template.verticalAlignment = column.verticalAlignment;
                        delete column.verticalAlignment;
                    }

                    if (template.type === DefaultControls.TextBox) {
                        if (column.inputPattern !== undefined) {
                            template.inputPattern = column.inputPattern;
                            delete column.inputPattern;
                        }
                    }

                    if (template.type === DefaultControls.ComboBox) {
                        if (column.options !== undefined) {
                            template.options = column.options;
                            delete column.options;
                        }
                    }

                    column.template = template;
                }
            }
        }

        ctrl.isTarget = true;

        if (ctrl.type === DefaultControls.VariableTargetListBox)
            ctrl.type = DefaultControls.VariablesListBox;
        else if (ctrl.type === DefaultControls.TargetListBox)
            ctrl.type = DefaultControls.ListBox;

        upgradedCtrl = {
              type: DefaultControls.TargetLayoutBox,
              controls: [ ctrl ]
        };

        if (ctrl.label !== undefined) {
            upgradedCtrl.label = ctrl.label;
            delete ctrl.label;
        }
    }

    if (ctrl.type === DefaultControls.ComboBox) {
        if (ctrl.options !== undefined) {
            for (let i = 0; i < ctrl.options.length; i++) {
                let option = ctrl.options[i];
                option.title = option.label;
                option.name = option.value;
                delete option.label;
                delete option.value;
            }
        }
    }

    if (ctrl.type === DefaultControls.CheckBox || ctrl.type === DefaultControls.RadioButton) {
        if (ctrl.checkedValue !== undefined) {
            ctrl.optionPart = ctrl.checkedValue;
            delete ctrl.checkedValue;
        }
    }

    return upgradedCtrl;
};

module.exports = checkForLayoutUpgrade;
