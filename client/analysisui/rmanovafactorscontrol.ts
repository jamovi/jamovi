'use strict';

import OptionControl, { OptionControlProperties } from './optioncontrol';
import LayoutGrid from './layoutgrid';
import HiddenScrollBarSupport from './hiddenscrollbarsupport';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import { GridControlProperties } from './gridcontrol';

class rmafcItem extends LayoutGrid {

    $closeButton: HTMLElement;
    $label: HTMLInputElement;
    levelButtons: HTMLElement[];
    $items: HTMLInputElement[];

    constructor(parent, data, isFirst, isLast) {
        super();
        //LayoutGrid.extendTo(this);

        this.parent = parent;
        this.isFirst = isFirst;
        this.data = data;
        this.$items = [];
        this.levelButtons = [];
    
        this._topIndex = -1;
    }

    render(index: number) {
        this._topIndex = index;
        this.$closeButton = HTML.parse('<div class="rma-delete-button"><span class="mif-cross"></span></div>');
        this.listenForCompleteRemove(this.$closeButton);

        let levels = [];
        let label = this.parent.translate('RM Factor {0}').replace('{0}', index + 1);
        let isEmpty = true;
        if (this.data !== undefined && this.data !== null) {
            label = this.data.label;
            levels = this.data.levels;
            isEmpty = false;
        }

        this.$label = HTML.parse('<input class="silky-option-listitem centre-text rma-factor-label" type="text" spellcheck="false" value="' + label + '">');
        let blurCall = event => {
            if (event.target !== this.$label)
                this.$label.blur();
        };
        this.$label.addEventListener('blur', () => { document.removeEventListener('mousedown', blurCall); });
        this.$label.addEventListener('focus', () => {
            setTimeout(() => { document.addEventListener('mousedown', blurCall); }, 0);
            this.$label.select();
        });
        this.$label.addEventListener('keydown', (event) => {
            let keypressed = event.keyCode || event.which;
            if (keypressed == 13) {
                this.enterPressed = -1;
                this.labelChange(this.$label);
                this.$label.blur();
                if (this.$items.length > 0) {
                    this.$items[0].focus();
                    this.enterPressed = -2;
                }
            }
        });
        this.listenForLabelChange(this.$label);
        if (isEmpty)
            this.$label.classList.add("rma-new-factor");
        else
            this.$label.classList.remove("rma-new-factor");
        let cell = this.addCell(0, 0, this.$label);
        cell.setHorizontalAlign('center');
        cell.setStretchFactor(1);

        this.$label.dataset.index = index.toString();

        if (this.isFirst || isEmpty)
            this.$closeButton.style.visibility = "hidden";
        else
            this.$closeButton.style.visibility = "visible";

        cell = this.addCell(1, 0, this.$closeButton);
        cell.vAlign = "center";

        if (isEmpty === false) {
            for (let i = 0; i <= levels.length; i++)
                this.createLevel(index, levels[i], i);
        }
    }

    intToRoman(number) {
        let text;
        if (number > 3999)
            throw "Can not convert to roman numeral. Number to large.";

        text  = [ '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][parseInt(number) % 10];
        text = [ '', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC'][parseInt(number / 10) % 10] + text;
        text = [ '', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM'][parseInt(number / 100) % 10] + text;
        text = [ '', 'M', 'MM', 'MMM'][parseInt(number / 1000) % 10] + text;

        return text;
    }

    getSequenceChar(seq, index) {
        seq = seq % 4;
        let alph = [];
        if (seq === 0)
            return (index + 1).toString();
        else if (seq === 1) {
            alph = [
                'A','B','C','D','E','F','G','H','I',
                'J','K','L','M','N','O','P','Q','R',
                'S','T','U','V','W','X','Y','Z'
            ];
        }
        else if (seq === 2) {
            alph = [
                'α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η',
                'θ', 'ι', 'κ', 'λ', 'μ', 'ν',
                'ξ', 'ο', 'π', 'ρ', 'σ', 'τ',
                'υ', 'φ', 'χ', 'ψ', 'ω'
            ];
        }
        else if (seq === 3)
            return this.intToRoman(index + 1);

        let value = '';
        let c = index;
        do {
            let i = c % alph.length;
            value = alph[i] + value;
            c -= i;
            c /= alph.length;
            c -= 1;
        }
        while (c >= 0);

        return value;
    }

    createLevel(groupIndex, levelText, index) {
        let level = index + 1;
        let text = s_('Level {0}').replace('{0}', this.getSequenceChar(groupIndex, index));
        let isEmpty = true;
        if (levelText !== null && levelText !== undefined) {
            text = levelText;
            isEmpty = false;
        }

        let $t: HTMLInputElement = null;
        let $levelButton = null;

        if (index < this.$items.length) {
            $t = this.$items[index];
            $t.value = text;
            $levelButton = this.levelButtons[index];
        }
        else {
            $t = HTML.parse('<input class="silky-option-listitem" type="text" spellcheck="false" value="' + text + '">');
            let blurCall = event => {
                if (event.target !== $t)
                    $t.blur();
            };
            $t.addEventListener('blur', () => { document.removeEventListener('mousedown', blurCall); });
            $t.focus(() => {
                setTimeout(() => { document.addEventListener('mousedown', blurCall); }, 0);
                $t.select();
            });

            this.listenForChange($t);
            this.$items[index] = $t;

            let cell = this.addCell(0, index + 1, $t);
            //cell.ignoreContentMargin_top = true;
            //cell.ignoreContentMargin_bottom = true;
            cell.setStretchFactor(1);

            $levelButton = HTML.parse('<div class="rma-delete-button"><span class="mif-cross"></span></div>');

            this.listenForRemove($levelButton);
            this.levelButtons[index] = $levelButton;

            cell = this.addCell(1, index + 1, $levelButton);
            cell.vAlign = "center";

            $t.addEventListener('keydown', (event) => {
                let keypressed = event.keyCode || event.which;
                if (keypressed == 13) {
                    this.enterPressed = index;
                    this.onChange($t);
                    $t.blur();
                    if (index + 1 < this.$items.length) {
                        this.$items[index + 1].focus();
                        this.enterPressed = -2;
                    }
                }
            });
        }

        $t.dataset.index = index.toString();
        $levelButton.dataset.index = index.toString();

        if (isEmpty)
            $t.classList.add("rma-new-factor-level");
        else
            $t.classList.remove("rma-new-factor-level");

        if (isEmpty === true || index <= 1)
            $levelButton.style.visibility = "hidden";
        else
            $levelButton.style.visibility = "visible";

        if (this.enterPressed === index - 1) {
            $t.focus();
            this.enterPressed = -2;
        }
    }

    updateData(data, index) {

        this._topIndex = index;
        this.data = data;
        if (data === undefined || data === null) {
            this.$label.value = this.parent.translate('RM Factor {0}').replace('{0}', (index + 1));
            this.$label.classList.add("rma-new-factor");
            this.$closeButton.style.visibility = "hidden";
            /*for (let i = 0; i < this.$items.length; i++) {
                this.$items[i].off();
                this.levelButtons[i].off();
            }*/
            this.removeRow(1, this.$items.length);
            this.$items = [];
        }
        else {
            this.$label.value = data.label;
            this.$label.classList.remove("rma-new-factor");
            this.$closeButton.dataset.index = index.toString();

            if (this.isFirst)
                this.$closeButton.style.visibility = "hidden";
            else
                this.$closeButton.style.visibility = "visible";

            for (let j = 0; j <= this.data.levels.length; j++) {
                this.createLevel(index, this.data.levels[j], j);
            }

            let toRemove = this.$items.length - this.data.levels.length - 1;
            if (toRemove > 0) {
                /*for (let k = this.data.levels.length + 1; k < this.$items.length; k++) {
                    this.$items[k].off();
                    this.levelButtons[k].off();
                }*/
                this.removeRow(this.data.levels.length + 2, toRemove);
                this.$items.splice(this.data.levels.length + 1, toRemove);
                this.levelButtons.splice(this.data.levels.length + 1, toRemove);
            }

        }
    }

    close() {
        /*for (let i = 0; i < this.$items.length; i++) {
            this.$items[i].off();
            this.levelButtons[i].off();
        }
        this.$closeButton.off();*/
    }

    listenForCompleteRemove($button) {
        $button.addEventListener('click', (event) => {
            let index = parseInt($button.dataset.index);
            this.parent.onItemRemoved(index);
        });
    }

    listenForRemove($button) {
        $button.addEventListener('click', (event) => {
            let index = parseInt($button.dataset.index);
            this.data.levels.splice(index, 1);
            this.parent.onItemChanged();
        });
    }

    listenForChange($item: HTMLInputElement) {
        $item.addEventListener('change', (event) => {
            this.onChange($item);
        });
    }

    onChange($item: HTMLInputElement) {
        let value = $item.value.trim();
        let index = parseInt($item.dataset.index);
        if (value === '')
            value = s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex, index));

        let checked = this.parent.checkLevelLabel(value, this._topIndex, index);
        if (checked !== value) {
            value = checked;
            $item.value = value;
        }

        this.data.levels[index] = value;
        this.parent.onItemChanged();
    }

    listenForLabelChange($item: HTMLInputElement) {
        $item.addEventListener('change', (event) => {
            this.labelChange($item);
        });
    }

    labelChange($item: HTMLInputElement) {
        let value = $item.value.trim();
        let index = parseInt($item.dataset.index);
        if (value === '')
            value = this.parent.translate('RM Factor {0}').replace('{0}', (index+1));

        let checked = this.parent.checkItemLabel(value, index);
        if (checked !== value) {
            value = checked;
            $item.value = value;
        }

        if (this.data === undefined || this.data === null) {
            this.parent.onItemAdded({label: value, levels: [s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex , 0)), s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex , 1))]});
        }
        else {
            this.data.label = value;
            this.parent.onItemChanged();
        }
    }
}

customElements.define('jmv-rmafcitem', rmafcItem);

type RMAnovaFactorsControlDataType = {
    label: string; 
    levels: string[] 
} [];

type RMAnovaFactorsControlProperties = GridControlProperties & OptionControlProperties<RMAnovaFactorsControlDataType>;

export class RMAnovaFactorsControl extends OptionControl<RMAnovaFactorsControlProperties> {
    
    static create(params: RMAnovaFactorsControlProperties) {
        if (navigator.platform === 'MacIntel') {
            const Base = HiddenScrollBarSupport(RMAnovaFactorsControl);
            return new Base(params);
        }
        else
            return new RMAnovaFactorsControl(params);
    }
    
    data: RMAnovaFactorsControlDataType = [];
    declare _el: LayoutGrid;
    _animateCells = true;
    items: rmafcItem[] = [];

    constructor(params: RMAnovaFactorsControlProperties) {
        super(params);

        this.setRootElement(new LayoutGrid());

        this.el.classList.add('rmanova-factors-control');
    }

    override get el() {
        return this._el;
    }

    createFactorsObject(data, index, isVirtual) {

        let item = this.items[index];
        if (item === null || item === undefined) {
            item = new rmafcItem(this, data, index === 0, isVirtual);
            item.render(index);

            let cell = this.el.addCell(0, index, item);
            cell.setStretchFactor(1);

            this.items[index] = item;
        }
        else {
            item.updateData(data, index);
        }
    }

    override onRenderToGrid(grid: LayoutGrid, row, column, owner) {

        let width = 1;
        if (grid.addCell('aux', row + 1, HTML.parse('<div class="supplier-button-filler"></div>')) !== null)
            width += 1;

        let label = this.getPropertyValue("label");
        if (label !== null) {
            label = this.translate(label);
            grid.addCell(column, row, HTML.parse('<div style="white-space: nowrap;" class="silky-rmanova-factors-header">' + label + '</div>'));
        }

        let cell = grid.addCell(column, row + 1, this);
        cell.setStretchFactor(0.5);

        return { height: 2, width: width };
    }

    onOptionSet(option) {
        if (this.getOption().isValueInitialized()) {
            this.data = this.clone(this.getSourceValue());
            this.updateData();
        }
    }

    onItemChanged(item) {
        this.setValue(this.data);
    }

    checkItemLabel(name, index) {
        let count = 0;
        let found = true;
        while (found) {
            found = false;
            let label = count === 0 ? name : (name + ' (' + (count + 1) + ')');
            for (let i = 0; i < this.data.length; i++) {
                let cItem = this.data[i];
                if (i !== index && label === cItem.label) {
                    found = true;
                    count += 1;
                    break;
                }
            }
            if (found === false)
                return label;
        }
    }

    checkLevelLabel(name, index, lIndex) {
        let count = 0;
        let found = true;
        while (found) {
            found = false;
            let label = count === 0 ? name : (name + ' (' + (count + 1) + ')');
            for (let i = 0; i < this.data.length; i++) {
                let cItem = this.data[i];
                for (let j = 0; j < cItem.levels.length; j++)  {
                    let level = cItem.levels[j];
                    if ( ! (i === index && j === lIndex) && label === level) {
                        found = true;
                        count += 1;
                        break;
                    }
                }
                if (found)
                    break;
            }
            if (found === false)
                return label;
        }
    }

    onItemAdded(data) {
        this.data.push(data);
        this.setValue(this.data);
    }

    onItemRemoved(index) {
        this.data.splice(index, 1);
        this.setValue(this.data);
    }

    override onOptionValueInserted(key, data) {
        let index = key[0];
        this.el.insertRow(index, 1);
        let optionData = this.clone(this.getValue(key));

        this.data.splice(index, 0, optionData);
        this.items.splice(index, 0, null);

        this.createFactorsObject(optionData, index, false);

        super.onOptionValueInserted(key, data);
    }

    override onOptionValueRemoved(key, data) {
        let index = key[0];
        this.items.splice(index, 1);
        this.el.removeRow(index);
        super.onOptionValueRemoved(key, data);
    }

    override onOptionValueChanged(key, data) {
        super.onOptionValueChanged(key, data);
        this.data = this.clone(this.getValue());
        this.updateData();
    }

    updateData() {
        if ((this.data === null || this.data.length === 0) && this.getOption().isValueInitialized())
            this.setValue([ {label: this.translate('RM Factor {0}').replace('{0}', '1'), levels: [s_('Level {0}').replace('{0}', 1), s_('Level {0}').replace('{0}', 2)] } ]);
        else {
            if (this.data === null)
                this.data = [];

            for (let i = 0; i <= this.data.length; i++)
                this.createFactorsObject(this.data[i], i, i  === this.data.length);

            if (this.items.length > this.data.length + 1) {
                let countToRemove = this.items.length - this.data.length - 1;
                for (let j = this.data.length + 1; j < this.items.length; j++)
                    this.items[j].close();
                this.items.splice(this.data.length + 1, countToRemove);
                this.el.removeRow(this.data.length + 1, countToRemove);
            }
        }
    }

    clone(object) {
        return JSON.parse(JSON.stringify(object));
    }
}

export default RMAnovaFactorsControl;
