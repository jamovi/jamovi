'use strict';

var _ = require('underscore');
var ControlManager = require('./controlmanager');
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

var SilkyControlManager = function() {

    ControlManager.extendTo(this);

    this.registerControl("rmanovafactorsbox", RMAnovaFactorsControl);
    this.registerControl("checkbox", GridCheckbox);
    this.registerControl("radiobutton", GridRadioButton);
    this.registerControl("combobox", GridCombobox);
    this.registerControl("textbox", GridTextbox);
    this.registerControl("listbox", GridOptionListControl);
    this.registerControl("targetlistbox", GridTargetList);
    this.registerControl("variabletargetlistbox", GridVariablesTargetList);
    this.registerControl("supplier", LayoutSupplierView);
    this.registerControl("variablesupplier", LayoutVariablesView);
    this.registerControl("collapsebox", LayoutCollapseView);
    this.registerControl("label", LayoutGroupView);
    this.registerControl("collection", ControlContainer);
    this.registerControl("layoutbox", ControlContainer);
    this.registerControl("listitem.variablelabel", ListItemVariableLabel);
    this.registerControl("listitem.combobox", ListItemCombobox);
    this.registerControl("listitem.label",ListItemLabel);
};


module.exports = SilkyControlManager;
