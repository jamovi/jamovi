
'use strict';

import TitledGridControl from './titledgridcontrol';
import OptionControl, { OptionControlProperties } from './optioncontrol';
import createChildLayoutSupport from './childlayoutsupport';
import EnumPropertyFilter from './enumpropertyfilter';
import { FormatDef, StringFormat } from './formatdef';
import Icons from './iconsupport';
import focusLoop from '../common/focusloop';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { GridControlProperties, VerticalAlignment } from './gridcontrol';
import { Margin } from './controlbase';
import { Control, CtrlDef } from './optionsview';

export enum ComplexLayoutStyle {
    List = "list",
    Inline= "inline",
    ListInline = "list-inline",
    InlineList = "inline-list"
}

export type LabelControlProperties = GridControlProperties & {
    style: ComplexLayoutStyle;
    margin: Margin;
    format: StringFormat;
    heading: boolean;
    label: string;
}

const isOptionedLabelParams = function(params: LabelControlProperties | OptionedLabelControlProperties): params is OptionedLabelControlProperties {
    return params.label === undefined;
}

export class LabelControl extends TitledGridControl<LabelControlProperties> {
    static create(params: (LabelControlProperties | OptionedLabelControlProperties)): Control<CtrlDef> {
        if (isOptionedLabelParams(params)) {
            const LabelClass = createChildLayoutSupport(params, OptionLabelControl);
            return new LabelClass(params);
        }
        else {
            const LabelClass = createChildLayoutSupport(params, LabelControl);
            return new LabelClass(params);
        }
    }

    icons: HTMLElement;
    style: string;

    constructor(params: LabelControlProperties) {
        super(params);

        this.registerSimpleProperty("label", "");

        Icons.addSupport(this);

        this.style = this.getPropertyValue('style');

        let groupText = this.getPropertyValue('label');

        if (groupText === null)
            groupText = "";

        groupText = this.translate(groupText);

        let classes = groupText === "" ? "silky-control-label-empty" : "";

        let hasChildren = this.hasProperty('controls');

        if (hasChildren === false) {
            if (params.cell && params.verticalAlignment === undefined) {
                this.setPropertyValue('verticalAlignment', VerticalAlignment.Center);
            }
        }
        
        let isHeading = true;
        if (hasChildren === false)
            isHeading = this.getPropertyValue('heading');
            
        classes += hasChildren === false ? ' no-children' : '';
        classes += isHeading ? ' heading-formating' : '';

        this.labelId = focusLoop.getNextAriaElementId('label');
        this._subel = HTML.parse(`<div id="${ this.labelId }" role="heading" aria-level="3" class="silky-control-label silky-control-margin-${ this.getPropertyValue("margin") } ${ classes }" style="white-space: nowrap;"><span>${ groupText }</span></div>`);
        if (this.el === undefined)
            this.setRootElement(this._subel);

        if (Icons.exists(this)) {
            this.icons = Icons.get(this);
            let iconPosition = Icons.position(this);
            if (iconPosition === 'right')
                this._subel.append(this.icons);
            else
                this._subel.prepend(this.icons);
        }
    }

    protected override registerProperties(properties: LabelControlProperties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('style', ComplexLayoutStyle.List, new EnumPropertyFilter(ComplexLayoutStyle, ComplexLayoutStyle.List));
        this.registerSimpleProperty('margin', Margin.Large, new EnumPropertyFilter(Margin, Margin.Large));
        this.registerSimpleProperty('format', FormatDef.string);
        this.registerSimpleProperty('heading', false);
    }
    
    setLabel(value: string): void {
        if (value === null)
            value = '';

        value = this.translate(value);

        this._subel.innerHTML = '<span>' + value + '</span>';
        let event = new CustomEvent('contentchanged');
        this._subel.dispatchEvent(event);

        if (value === "")
            this._subel.classList.add("silky-control-label-empty");
        else
            this._subel.classList.remove("silky-control-label-empty");
    }

    override onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'label')
            this.setLabel(this.getPropertyValue(name));
    }

    setValue(value: string) {
        this.setPropertyValue("label", value);
    }

    onI18nChanged() {
        let label = this.getPropertyValue('label');
        this.setLabel(label);
    }
}

export type OptionedLabelControlProperties = Omit<LabelControlProperties, 'label'> & OptionControlProperties<string>;

export class OptionLabelControl extends OptionControl<OptionedLabelControlProperties> {

    icons: HTMLElement;
    style: string;

    constructor(params: OptionedLabelControlProperties) {
        super(params);


        Icons.addSupport(this);

        this.style = this.getPropertyValue('style');

        let classes = "silky-control-label-empty";

        let hasChildren = this.hasProperty('controls');

        if (hasChildren === false) {
            if (params.cell && params.verticalAlignment === undefined) {
                this.setPropertyValue('verticalAlignment', VerticalAlignment.Center);
            }
        }
        
        let isHeading = true;
        if (hasChildren === false)
            isHeading = this.getPropertyValue('heading');
            
        classes += hasChildren === false ? ' no-children' : '';
        classes += isHeading ? ' heading-formating' : '';

        this.labelId = focusLoop.getNextAriaElementId('label');
        this._subel = HTML.parse(`<div id="${ this.labelId }" role="heading" aria-level="3" class="silky-control-label silky-control-margin-${ this.getPropertyValue("margin") } ${ classes }" style="white-space: nowrap;"><span></span></div>`);
        if (this.el === undefined)
            this.setRootElement(this._subel);

        if (Icons.exists(this)) {
            this.icons = Icons.get(this);
            let iconPosition = Icons.position(this);
            if (iconPosition === 'right')
                this._subel.append(this.icons);
            else
                this._subel.prepend(this.icons);
        }
    }

    protected override registerProperties(properties: OptionedLabelControlProperties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('style', ComplexLayoutStyle.List, new EnumPropertyFilter(ComplexLayoutStyle, ComplexLayoutStyle.List));
        this.registerSimpleProperty('margin', Margin.Large, new EnumPropertyFilter(Margin, Margin.Large));
        this.registerSimpleProperty('format', FormatDef.string);
        this.registerSimpleProperty('heading', false);
    }
    
    setLabel(value: string): void {
        if (value === null)
            value = '';

        value = this.translate(value);

        this._subel.innerHTML = '<span>' + value + '</span>';
        let event = new CustomEvent('contentchanged');
        this._subel.dispatchEvent(event);

        if (value === "")
            this._subel.classList.add("silky-control-label-empty");
        else
            this._subel.classList.remove("silky-control-label-empty");
    }
    
    override onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'enable') {
            let disabled = this.getPropertyValue('enable') === false;
            if (disabled)
                this._subel.classList.add('disabled-text');
            else
                this._subel.classList.remove('disabled-text');
        }
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        let format = this.getPropertyValue('format');
        this.setLabel(format.toString(this.getValue()));
    }

    onI18nChanged() {
        let format = this.getPropertyValue('format');
        let label = format.toString(this.getValue());
        this.setLabel(label);
    }
}

export default LabelControl;
