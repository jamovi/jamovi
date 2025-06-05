
'use strict';

import TitledGridControl from './titledgridcontrol';
import OptionControl from './optioncontrol';
import createChildLayoutSupport from './childlayoutsupport';
import EnumPropertyFilter from './enumpropertyfilter';
import { FormatDef } from './formatdef';
const Icons = require('./iconsupport');
const focusLoop = require('../common/focusloop');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class LayoutGroupView extends TitledGridControl {
    static create(params) {
        let isOptionControl = params.label === undefined;
        if (isOptionControl) {
            const LabelClass = createChildLayoutSupport(params, OptionedLabel);
            return new LabelClass(params);
        }
        else {
            const LabelClass = createChildLayoutSupport(params, Label);
            return new LabelClass(params);
        }
    }

    icons: HTMLElement;
    style: string;

    constructor(params, isOptionControl) {
        super(params);

        if (isOptionControl === false)
            this.registerSimpleProperty("label", "");

        Icons.addSupport(this);

        this.style = this.getPropertyValue('style');

        let groupText = "";
        if (isOptionControl === false)
            groupText = this.getPropertyValue('label');

        if (groupText === null)
            groupText = "";

        groupText = this.translate(groupText);

        let classes = groupText === "" ? "silky-control-label-empty" : "";

        let hasChildren = this.hasProperty('controls');

        if (hasChildren === false) {
            if (params.cell && params.verticalAlignment === undefined) {
                this.setPropertyValue('verticalAlignment', 'center');
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
            this.el = this._subel;

        if (Icons.exists(this)) {
            this.icons = Icons.get(this);
            let iconPosition = Icons.position(this);
            if (iconPosition === 'right')
                this._subel.append(this.icons);
            else
                this._subel.prepend(this.icons);
        }
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty('style', 'list', new EnumPropertyFilter(["list", "inline", "list-inline", "inline-list"], "list"));
        this.registerSimpleProperty('margin', 'large', new EnumPropertyFilter(["small", "normal", "large", "none"], "large"));
        this.registerSimpleProperty('format', FormatDef.string);
        this.registerSimpleProperty('heading', false);
    }
    
    setLabel(value) {
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
}

export class Label extends LayoutGroupView {
    constructor(params) {
        super(params, false);
    }

    onPropertyChanged(name: string) {
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

export class OptionedLabel extends OptionControl(LayoutGroupView) {
    constructor(params) {
        super(params, true);
    }

    onPropertyChanged(name) {
        super.onPropertyChanged(name);

        if (name === 'enable') {
            let disabled = this.getPropertyValue(name) === false;
            if (disabled)
                this._subel.classList.add('disabled-text');
            else
                this._subel.classList.remove('disabled-text');
        }
    }

    onOptionValueChanged(key, data) {
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

export default LayoutGroupView;
