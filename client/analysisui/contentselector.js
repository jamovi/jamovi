'use strict';

const $ = require('jquery');
const LayoutGrid = require('./layoutgrid');
const GridControl = require('./gridcontrol');
const OptionControl = require('./optioncontrol');
const EnumPropertyFilter = require('./enumpropertyfilter');
const focusLoop = require('../common/focusloop');

const ContentSelector = function(params) {

    OptionControl.extendTo(this, params);
    GridControl.extendTo(this, params);
    LayoutGrid.extendTo(this);

    this.registerSimpleProperty("label", null);
    this.registerOptionProperty("options");
    this.registerSimpleProperty("form", "tabs", new EnumPropertyFilter(["listbox", "radio", "tabs"], "listbox"));

    this._body = null;

    this.createItem = function () {
        let name = this.getPropertyValue('name');
        let form = this.getPropertyValue('form');

        this.$el.attr('form', form);

        this.$el.addClass("jmv-content-selector silky-control-margin-" + this.getPropertyValue("margin"));

        let groupText = this.getPropertyValue('label');
        groupText = this.translate(groupText);

        this.labelId = focusLoop.getNextAriaElementId('label');
        this.$header = $(`<div class="selector-body silky-control-margin-${this.getPropertyValue("margin")}">
                            <label id="${this.labelId}">${groupText}</label>
                          </div>`);

        this.$tablist = null;
        if (form === 'listbox') {
            this.$tablist = $(`<select aria-labeledby="${this.labelId}" name="${name}">`);
            this.$tablist.on('change', (event) => {
                this.setValue(this.$tablist.val());
            });
        }
        else {
            this.$tablist = $(`<div class="tablist"></div>`);
        }
        this.$header.append(this.$tablist);

        this._headerCell = this.addCell(0, 0, this.$header);
        this._headerCell.setStretchFactor(1);

        this.populateTabs();
        this.updateDisplayValue();
    };

    this.setBody = function (body) {     
        let bodyId = body.$el.attr('id');
        if (!bodyId) {
            bodyId = focusLoop.getNextAriaElementId('body');
            body.$el.attr('id', bodyId);
        }
        body.$el.attr('role', 'region');
        body.$el.attr('aria-labelledby', this.labelId);

        this.$header.attr('aria-controls', bodyId);

        this._body = body;
        body.$el.addClass("silky-control-body");
        let data = body.renderToGrid(this, 1, 0);
        this._bodyCell = data.cell;
        this._bodyCell.setVisibility(true);
        return data.cell;
    };

    this.onOptionValueChanged = function (key, data) {
        this.updateDisplayValue();
    };

    this.populateTabs = function () {
        if (this.$tablist) {
            let options = this.getPropertyValue('options');
            let name = this.getPropertyValue('name');
            let form = this.getPropertyValue('form');

            this.$tablist.empty();

            for (let i = 0; i < options.length; i++) {
                switch (form) {
                    case 'tabs':
                        let $button = $(`<button class="clickable" value="${options[i].name}">${options[i].title}</button>`);
                        this.$tablist.append($button);
                        break;
                    case 'radio':
                        let labelId = focusLoop.getNextAriaElementId('label');
                        let $label = $(`<label id="${labelId}">${options[i].title}</label>`);
                        let $radio = $(`<input class="clickable" type="radio" name="${name}" value="${options[i].name}"/>`);
                        $label.prepend($radio);
                        this.$tablist.append($label);
                        break;
                    default:
                        let $option = $(`<option value="${options[i].name}">${options[i].title}</option>`);
                        this.$tablist.append($option);
                        break;
                }
            }

            let $clickable = this.$tablist.find('.clickable');
            $clickable.on('click', (event) => {
                this.setValue(event.target.getAttribute('value'));
            });


        }
    };

    this.updateDisplayValue = function () {
        let value = this.getSourceValue();
        if (this._body)
            this._body.setContainer(value);
        
        if (this.$tablist) {
            let form = this.getPropertyValue('form');
            switch (form) {
                case 'radio':
                    let element = this.$tablist.find(`[value=${value}]`);
                    element[0].checked = true;
                    break;
                case 'tabs':
                    this.$tablist.find('.selected-tab').removeClass('selected-tab');
                    let tab = this.$tablist.find(`[value=${value}]`);
                    tab.addClass('selected-tab');
                    break;
                default:
                    this.$tablist.val(value);
                    break;
            }
        }
    };

    this._override('onPropertyChanged', (baseFunction, name) => {
        if (baseFunction !== null)
            baseFunction.call(this, name);

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
    });
};

module.exports = ContentSelector;
