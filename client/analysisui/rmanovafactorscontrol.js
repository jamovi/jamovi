'use strict';

const $ = require('jquery');
const GridOptionControl = require('./gridoptioncontrol');
const LayoutGrid = require('./layoutgrid').Grid;
const HiddenScrollBarSupport = require('./hiddenscrollbarsupport');

const rmafcItem = function(parent, data, isFirst, isLast) {

    LayoutGrid.extendTo(this);

    this.parent = parent;
    this.isFirst = isFirst;
    this.data = data;
    this.$items = [];
    this.levelButtons = [];

    this._topIndex = -1;

    this.render = function(index) {

        this._topIndex = index;
        this.$closeButton = $('<div class="rma-delete-button"><span class="mif-cross"></span></div>');
        this.listenForCompleteRemove(this.$closeButton);

        let levels = [];
        let label = parent.translate('RM Factor {0}').replace('{0}', index + 1);
        let isEmpty = true;
        if (this.data !== undefined && this.data !== null) {
            label = this.data.label;
            levels = this.data.levels;
            isEmpty = false;
        }

        this.$label = $('<input class="silky-option-listitem centre-text rma-factor-label" type="text" value="' + label + '">');
        let blurCall = event => {
            if (event.target !== this.$label[0])
                this.$label.blur();
        };
        this.$label.blur(() => { $(document).off('mousedown', blurCall); });
        this.$label.focus(() => {
            setTimeout(() => { $(document).on('mousedown', blurCall); }, 0);
            this.$label.select();
        });
        this.$label.keydown((event) => {
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
            this.$label.addClass("rma-new-factor");
        else
            this.$label.removeClass("rma-new-factor");
        let cell = this.addCell(0, 0, this.$label);
        cell.setHorizontalAlign('center');
        cell.setStretchFactor(1);
        if (this.isFirst === false)
            cell.ignoreContentMargin_top = true;
        cell.ignoreContentMargin_bottom = true;

        this.$label.data("index", index);

        if (this.isFirst || isEmpty)
            this.$closeButton.css("visibility", "hidden");
        else
            this.$closeButton.css("visibility", "visible");

        cell = this.addCell(1, 0, this.$closeButton);
        cell.vAlign = "center";

        if (isEmpty === false) {
            for (let i = 0; i <= levels.length; i++)
                this.createLevel(index, levels[i], i);
        }
    };

    this.intToRoman = function(number) {
        let text;
        if (number > 3999)
            throw "Can not convert to roman numeral. Number to large.";

        text  = [ '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'][parseInt(number) % 10];
        text = [ '', 'X', 'XX', 'XXX', 'XL', 'L', 'LX', 'LXX', 'LXXX', 'XC'][parseInt(number / 10) % 10] + text;
        text = [ '', 'C', 'CC', 'CCC', 'CD', 'D', 'DC', 'DCC', 'DCCC', 'CM'][parseInt(number / 100) % 10] + text;
        text = [ '', 'M', 'MM', 'MMM'][parseInt(number / 1000) % 10] + text;

        return text;
    };

    this.getSequenceChar = function(seq, index) {
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
    };

    this.createLevel = function(groupIndex, levelText, index) {
        let level = index + 1;
        let text = s_('Level {0}').replace('{0}', this.getSequenceChar(groupIndex, index));
        let isEmpty = true;
        if (levelText !== null && levelText !== undefined) {
            text = levelText;
            isEmpty = false;
        }

        let $t = null;
        let $levelButton = null;

        if (index < this.$items.length) {
            $t = this.$items[index];
            $t.val(text);
            $levelButton = this.levelButtons[index];
        }
        else {
            $t = $('<input class="silky-option-listitem" type="text" value="' + text + '">');
            let blurCall = event => {
                if (event.target !== $t[0])
                    $t.blur();
            };
            $t.blur(() => { $(document).off('mousedown', blurCall); });
            $t.focus(() => {
                setTimeout(() => { $(document).on('mousedown', blurCall); }, 0);
                $t.select();
            });

            this.listenForChange($t);
            this.$items[index] = $t;

            let cell = this.addCell(0, index + 1, $t);
            cell.ignoreContentMargin_top = true;
            cell.ignoreContentMargin_bottom = true;
            cell.setStretchFactor(1);

            $levelButton = $('<div class="rma-delete-button"><span class="mif-cross"></span></div>');

            this.listenForRemove($levelButton);
            this.levelButtons[index] = $levelButton;

            cell = this.addCell(1, index + 1, $levelButton);
            cell.vAlign = "center";

            $t.keydown((event) => {
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

        $t.data("index", index);
        $levelButton.data("index", index);

        if (isEmpty)
            $t.addClass("rma-new-factor-level");
        else
            $t.removeClass("rma-new-factor-level");

        if (isEmpty === true || index <= 1)
            $levelButton.css("visibility", "hidden");
        else
            $levelButton.css("visibility", "visible");

        if (this.enterPressed === index - 1) {
            $t.focus();
            this.enterPressed = -2;
        }
    };

    this.updateData = function(data, index) {

        this._topIndex = index;
        this.data = data;
        if (data === undefined || data === null) {
            this.$label.val(this.parent.translate('RM Factor {0}').replace('{0}', (index + 1)));
            this.$label.addClass("rma-new-factor");
            this.$closeButton.css("visibility", "hidden");
            for (let i = 0; i < this.$items.length; i++) {
                this.$items[i].off();
                this.levelButtons[i].off();
            }
            this.removeRow(1, this.$items.length);
            this.$items = [];
        }
        else {
            this.$label.val(data.label);
            this.$label.removeClass("rma-new-factor");
            this.$closeButton.data("index", index);

            if (this.isFirst)
                this.$closeButton.css("visibility", "hidden");
            else
                this.$closeButton.css("visibility", "visible");

            for (let j = 0; j <= this.data.levels.length; j++) {
                this.createLevel(index, this.data.levels[j], j);
            }

            let toRemove = this.$items.length - this.data.levels.length - 1;
            if (toRemove > 0) {
                for (let k = this.data.levels.length + 1; k < this.$items.length; k++) {
                    this.$items[k].off();
                    this.levelButtons[k].off();
                }
                this.removeRow(this.data.levels.length + 2, toRemove);
                this.$items.splice(this.data.levels.length + 1, toRemove);
                this.levelButtons.splice(this.data.levels.length + 1, toRemove);
            }

        }
    };

    this.close = function() {
        for (let i = 0; i < this.$items.length; i++) {
            this.$items[i].off();
            this.levelButtons[i].off();
        }
        this.$closeButton.off();
    };

    this.listenForCompleteRemove = function($button) {
        $button.click((event) => {
            let index = $button.data("index");
            this.parent.onItemRemoved(index);
        });
    };

    this.listenForRemove = function($button) {
        $button.click((event) => {
            let index = $button.data("index");
            this.data.levels.splice(index, 1);
            this.parent.onItemChanged();
        });
    };

    this.listenForChange = function($item) {
        $item.change((event) => {
            this.onChange($item);
        });
    };

    this.onChange = function($item) {
        let value = $item.val().trim();
        let index = $item.data("index");
        if (value === '')
            value = s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex, index));

        let checked = this.parent.checkLevelLabel(value, this._topIndex, index);
        if (checked !== value) {
            value = checked;
            $item.val(value);
        }

        this.data.levels[index] = value;
        this.parent.onItemChanged();
    };

    this.listenForLabelChange = function($item) {
        $item.change((event) => {
            this.labelChange($item);
        });
    };

    this.labelChange = function($item) {
        let value = $item.val().trim();
        let index = $item.data("index");
        if (value === '')
            value = this.parent.translate('RM Factor {0}').replace('{0}', (index+1));

        let checked = this.parent.checkItemLabel(value, index);
        if (checked !== value) {
            value = checked;
            $item.val(value);
        }

        if (this.data === undefined || this.data === null) {
            this.parent.onItemAdded({label: value, levels: [s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex , 0)), s_('Level {0}').replace('{0}', this.getSequenceChar(this._topIndex , 1))]});
        }
        else {
            this.data.label = value;
            this.parent.onItemChanged();
        }
    };
};

const RMAnovaFactorsControl = function(params) {
    GridOptionControl.extendTo(this, params);
    LayoutGrid.extendTo(this);

    this.$el.addClass('rmanova-factors-control');

    if (navigator.platform === 'MacIntel')
        HiddenScrollBarSupport.extendTo(this);

    this._animateCells = true;

    this.items = [];

    this.createFactorsObject = function(data, index, isVirtual) {

        let item = this.items[index];
        if (item === null || item === undefined) {
            item = new rmafcItem(this, data, index === 0, isVirtual);
            item.render(index);

            let cell = this.addCell(0, index, item);
            cell.setStretchFactor(1);

            this.items[index] = item;
        }
        else {
            item.updateData(data, index);
        }
    };

    this.onRenderToGrid = function(grid, row, column) {

        let width = 1;
        if (grid.addCell('aux', row + 1, $('<div class="supplier-button-filler"></div>')) !== null)
            width += 1;

        let label = this.getPropertyValue("label");
        if (label !== null) {
            label = this.translate(label);
            grid.addCell(column, row, $('<div style="white-space: nowrap;" class="silky-rmanova-factors-header">' + label + '</div>'));
        }

        let cell = grid.addCell(column, row + 1, this);
        cell.setStretchFactor(0.5);

        return { height: 2, width: width };
    };

    this.onOptionSet = function(option) {
        if (this.getOption().isValueInitialized()) {
            this.data = this.clone(this.getSourceValue());
            this.updateData();
        }
    };

    this.data = [];

    this.onItemChanged = function(item) {
        this.setValue(this.data);
    };

    this.checkItemLabel = function(name, index) {
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
    };

    this.checkLevelLabel = function(name, index, lIndex) {
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
    };

    this.onItemAdded = function(data) {
        this.data.push(data);
        this.setValue(this.data);
    };

    this.onItemRemoved = function(index) {
        this.data.splice(index, 1);
        this.setValue(this.data);
    };

    this.onOptionValueInserted = function(key, data) {
        let index = key[0];
        this.insertRow(index, 1);
        let optionData = this.clone(this.getValue(key));

        this.data.splice(index, 0, optionData);
        this.items.splice(index, 0, null);

        this.createFactorsObject(optionData, index, false);
    };

    this.onOptionValueRemoved = function(key, data) {
        let index = key[0];
        this.items.splice(index, 1);
        this.removeRow(index);
    };

    this.onOptionValueChanged = function(key, data) {
        this.data = this.clone(this.getValue());
        this.updateData();
    };

    this.updateData = function() {
        if ((this.data === null || this.data.length === 0) && this.getOption().isValueInitialized())
            this.setValue([ {label: this.translate('RM Factor {0}').replace('{0}', 1), levels: [s_('Level {0}').replace('{0}', 1), s_('Level {0}').replace('{0}', 2)] } ]);
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
                this.removeRow(this.data.length + 1, countToRemove);
            }
        }
    };

    this.clone = function(object) {
        return JSON.parse(JSON.stringify(object));
    };
};

module.exports = RMAnovaFactorsControl;
