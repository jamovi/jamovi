'use strict';

var LayoutGroupView = require('./layoutgroupview');
var LayoutCollapseView = require('./layoutcollapseview');
var LayoutSupplierView = require('./layoutsupplierview');
var LayoutVariablesView = require('./layoutvariablesview');
var GridCheckbox = require('./gridcheckbox');
var GridRadioButton = require('./gridradiobutton');
var GridTextbox = require('./gridtextbox');
var GridCombobox = require('./gridcombobox');
var GridVariablesTargetList =  require('./gridvariablestargetlist');
var GridTargetList =  require('./gridtargetlist');
var GridOptionListControl = require('./gridoptionlistcontrol');
var ControlContainer = require('./controlcontainer');
var RMAnovaFactorsControl = require('./rmanovafactorscontrol');
var ListItemVariableLabel = require('./listitemvariablelabel');
var ListItemCombobox = require('./listitemcombobox');
var ListItemLabel = require('./listitemlabel');
var ListItemTermLabel = require('./listitemtermlabel');
var ListItemTextbox = require('./listitemtextbox');

var DefaultControls = {

    RMAnovaFactorsBox: RMAnovaFactorsControl,
    CheckBox: GridCheckbox,
    RadioButton: GridRadioButton,
    ComboBox: GridCombobox,
    TextBox: GridTextbox,
    ListBox: GridOptionListControl,
    TargetListBox: GridTargetList,
    VariableTargetListBox: GridVariablesTargetList,
    Supplier: LayoutSupplierView,
    VariableSupplier: LayoutVariablesView,
    CollapseBox: LayoutCollapseView,
    Label: LayoutGroupView,
    LayoutBox: ControlContainer,
    ListItem : {
        VariableLabel: ListItemVariableLabel,
        ComboBox: ListItemCombobox,
        Label: ListItemLabel,
        TermLabel: ListItemTermLabel,
        TextBox: ListItemTextbox
    }
};

module.exports = DefaultControls;
