'use strict';

import LayoutCollapseView from './layoutcollapseview';
import Label from './layoutgroupview';
import LayoutSupplierView from './layoutsupplierview';
import LayoutVariablesView from './layoutvariablesview';
import GridCheckbox from './gridcheckbox';
import GridRadioButton from './gridradiobutton';
import GridTextbox from './gridtextbox';
import GridCombobox from './gridcombobox';
import GridOptionListControl from './optionlistcontrol';
import { ControlContainer } from './controlcontainer';
import RMAnovaFactorsControl from './rmanovafactorscontrol';
import VariableLabel from './variablelabel';
import TermLabel from './termlabel';
import GridTargetContainer from './gridtargetcontrol';
import VariablesListBox from './variableslistbox';
import LevelSelector from './levelselector';
import CustomControl from './customcontrol';
import OutputSupplier from './outputsupplier';
import OutputControl from './output';
import ModeSelector from './contentselector';
import ActionButton from './gridactionbutton';
import { ControlType, CtrlDef } from './optionsview';

const DefaultControls: { [key: string]: ControlType<CtrlDef> } = {

    RMAnovaFactorsBox: RMAnovaFactorsControl,
    CheckBox: GridCheckbox,
    RadioButton: GridRadioButton,
    ComboBox: GridCombobox,
    TextBox: GridTextbox,
    ListBox: GridOptionListControl,
    TargetLayoutBox: GridTargetContainer,
    VariablesListBox: VariablesListBox,
    //TargetListBox: function() { return "TargetListBox is no longer used."; },
    //VariableTargetListBox: function() { return "VariableTargetListBox is no longer used."; },
    Supplier: LayoutSupplierView,
    VariableSupplier: LayoutVariablesView,
    CollapseBox: LayoutCollapseView,
    Label: Label,
    LayoutBox: ControlContainer,
    VariableLabel: VariableLabel,
    TermLabel: TermLabel,
    LevelSelector: LevelSelector,
    CustomControl: CustomControl,
    OutputSupplier: OutputSupplier,
    Output: OutputControl,
    ModeSelector: ModeSelector,
    ActionButton: ActionButton,

    /*ListItem: { //Not to be used, no longer supported
        TextBox: GridTextbox, //Not to be used, no longer supported
        ComboBox: GridCombobox, //Not to be used, no longer supported
        TermLabel: TermLabel, //Not to be used, no longer supported
        VariableLabel:VariableLabel, //Not to be used, no longer supported
        Label: Label //Not to be used, no longer supported
    }*/
};

export default DefaultControls;
