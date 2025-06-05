'use strict';

import { LayoutGridItem } from './layoutgrid';
import GridControl from './gridcontrol';
import OptionControl from './optioncontrol';
const EnumPropertyFilter = require('./enumpropertyfilter');
const focusLoop = require('../common/focusloop');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import type MultiContainer from './multicontainer';

export class ContentSelector extends LayoutGridItem(OptionControl(GridControl)) {
    _body: MultiContainer;
    header: HTMLElement;
    tablist: HTMLElement;

    constructor(params) {
        super(params);

        this._body = null;
    }

    protected registerProperties(properties) {
        super.registerProperties(properties);

        this.registerSimpleProperty("label", null);
        this.registerOptionProperty("options");
        this.registerSimpleProperty("form", "tabs", new EnumPropertyFilter(["listbox", "radio", "tabs"], "listbox"));
    }

    onPropertyChanged(name) {
        super.onPropertyChanged(name);

        /*if (name === 'enable') {
            let enabled = this.getPropertyValue(name);
            this.$input.prop('disabled', enabled === false);
            if (this.$label !== null) {
                if (enabled)
                    this.$label.removeClass('disabled-text');
                else
                    this.$label.addClass('disabled-text');
            }
        }*/
    }

    createItem() {
        let name = this.getPropertyValue('name');
        let form = this.getPropertyValue('form');

        this.el.setAttribute('form', form);

        this.el.classList.add(`jmv-content-selector`, `silky-control-margin-${this.getPropertyValue("margin")}`);

        let groupText = this.getPropertyValue('label');
        groupText = this.translate(groupText);

        this.labelId = focusLoop.getNextAriaElementId('label');
        this.header = HTML.parse(`<div class="selector-body silky-control-margin-${this.getPropertyValue("margin")}">
                            <label id="${this.labelId}">${groupText}</label>
                          </div>`);

        this.tablist = null;
        if (form === 'listbox') {
            this.tablist = HTML.parse(`<select aria-labeledby="${this.labelId}" name="${name}">`);
            this.tablist.addEventListener('change', (event) => {
                this.setValue((this.tablist as HTMLInputElement).value);
            });
        }
        else {
            this.tablist = HTML.parse(`<div class="tablist"></div>`);
        }
        this.header.append(this.tablist);

        this._headerCell = this.el.addCell(0, 0, this.header);
        this._headerCell.setStretchFactor(1);

        this.populateTabs();
        this.updateDisplayValue();
    }

    setBody(body: MultiContainer) {     
        let bodyId = body.el.getAttribute('id');
        if (!bodyId) {
            bodyId = focusLoop.getNextAriaElementId('body');
            body.el.setAttribute('id', bodyId);
        }
        body.el.setAttribute('role', 'region');
        body.el.setAttribute('aria-labelledby', this.labelId);

        this.header.setAttribute('aria-controls', bodyId);

        this._body = body;
        body.el.classList.add("silky-control-body");
        let data = body.renderToGrid(this.el, 1, 0, this);
        this._bodyCell = data.cell;
        this._bodyCell.setVisibility(true);
        return data.cell;
    }

    onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.updateDisplayValue();
    }

    populateTabs() {
        if (this.tablist) {
            let options = this.getPropertyValue('options');
            let name = this.getPropertyValue('name');
            let form = this.getPropertyValue('form');

            this.tablist.innerHTML = '';

            for (let i = 0; i < options.length; i++) {
                switch (form) {
                    case 'tabs':
                        let button = HTML.parse(`<button class="clickable" value="${options[i].name}">${options[i].title}</button>`);
                        this.tablist.append(button);
                        break;
                    case 'radio':
                        let labelId = focusLoop.getNextAriaElementId('label');
                        let label = HTML.parse(`<label id="${labelId}">${options[i].title}</label>`);
                        let radio = HTML.parse(`<input class="clickable" type="radio" name="${name}" value="${options[i].name}"/>`);
                        label.prepend(radio);
                        this.tablist.append(label);
                        break;
                    default:
                        let option = HTML.parse(`<option value="${options[i].name}">${options[i].title}</option>`);
                        this.tablist.append(option);
                        break;
                }
            }

            const clickableElements = this.tablist.querySelectorAll<HTMLElement>('.clickable');
            clickableElements.forEach(el => {
                el.addEventListener('click', (event) => {
                    if (event.target instanceof HTMLElement)
                        this.setValue(event.target.getAttribute('value'));
                });
            });
        }
    }

    updateDisplayValue() {
        let value = this.getSourceValue();
        if (this._body)
            this._body.setContainer(value);
        
        if (this.tablist) {
            let form = this.getPropertyValue('form');
            switch (form) {
                case 'radio':
                    let element = this.tablist.querySelector<HTMLInputElement>(`[value=${value}]`);
                    element.checked = true;
                    break;
                case 'tabs':

                    let selectedTabs = this.tablist.querySelectorAll<HTMLElement>('.selected-tab');
                    selectedTabs.forEach(el => {
                        el.classList.remove('selected-tab');
                    });
                    let tab = this.tablist.querySelector<HTMLInputElement>(`[value=${value}]`);
                    tab.classList.add('selected-tab');
                    break;
                default:
                    if (this.tablist instanceof HTMLInputElement)
                        this.tablist.value = value;
                    break;
            }
        }
    }
}

export default ContentSelector;
