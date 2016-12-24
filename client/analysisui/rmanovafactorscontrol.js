'use strict';

var _ = require('underscore');
var $ = require('jquery');
var GridOptionControl = require('./gridoptioncontrol');
var LayoutGrid = require('./layoutgrid').Grid;

var rmafcItem = function(parent, data, isFirst, isLast) {

    LayoutGrid.extendTo(this);

    this.parent = parent;
    this.isFirst = isFirst;
    this.data = data;
    this.$items = [];
    this.levelButtons = [];

    this.render = function(index) {

        this.$closeButton = $('<div class="rma-delete-button"><span class="mif-cross"></span></div>');
        this.listenForCompleteRemove(this.$closeButton);

        var levels = [];
        var label = "RM Factor " + (index + 1);
        var isEmpty = true;
        if (_.isUndefined(this.data) === false && this.data !== null) {
            label = this.data.label;
            levels = this.data.levels;
            isEmpty = false;
        }

        this.$label = $('<input class="silky-option-listitem centre-text rma-factor-label" type="text" value="' + label + '">');
        this.$label.focus(function() { $(this).select(); } );
        this.$label.keydown((event) => {
            var keypressed = event.keyCode || event.which;
            if (keypressed == 13) {
                this.labelChange(this.$label);
                this.$label.blur();
            }
        });
        this.listenForLabelChange(this.$label);
        if (isEmpty)
            this.$label.addClass("rma-new-factor");
        else
            this.$label.removeClass("rma-new-factor");
        var cell = this.addCell(0, 0, false, this.$label);
        cell.hAlign = 'centre';
        cell.setStretchFactor(1);
        if (this.isFirst === false)
            cell.ignoreContentMargin_top = true;
        cell.ignoreContentMargin_bottom = true;

        if (this.isFirst || isEmpty)
            this.$closeButton.css("visibility", "hidden");
        else
            this.$closeButton.css("visibility", "visible");

        cell = this.addCell(1, 0, false, this.$closeButton);
        cell.vAlign = "centre";

        if (isEmpty === false) {
            for (var i = 0; i <= levels.length; i++)
                this.createLevel(levels[i], i);
        }
    };

    this.createLevel = function(levelText, index) {
        var level = index + 1;
        var text = "Level " + level;
        var isEmpty = true;
        if (levelText !== null && _.isUndefined(levelText) === false) {
            text = levelText;
            isEmpty = false;
        }

        var $t = null;
        var $levelButton = null;

        if (index < this.$items.length) {
            $t = this.$items[index];
            $t.val(text);
            $levelButton = this.levelButtons[index];
        }
        else {
            $t = $('<input class="silky-option-listitem" type="text" value="' + text + '">');
            $t.focus(function() { $(this).select(); } );
            $t.keydown((event) => {
                var keypressed = event.keyCode || event.which;
                if (keypressed == 13) {
                    this.onChange($t);
                    $t.blur();
                }
            });
            this.listenForChange($t);
            this.$items[index] = $t;

            var cell = this.addCell(0, index + 1, false, $t);
            cell.ignoreContentMargin_top = true;
            cell.ignoreContentMargin_bottom = true;
            cell.setStretchFactor(1);

            $levelButton = $('<div class="rma-delete-button"><span class="mif-cross"></span></div>');
            var self = this;
            this.listenForRemove($levelButton);
            this.levelButtons[index] = $levelButton;

            cell = this.addCell(1, index + 1, false, $levelButton);
            cell.vAlign = "centre";
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
    };

    this.updateData = function(data, index) {
        this.data = data;
        this.suspendLayout();
        if (_.isUndefined(data) || data === null) {
            this.$label.val("RM Factor " + (index + 1));
            this.$label.addClass("rma-new-factor");
            this.$closeButton.css("visibility", "hidden");
            for (var i = 0; i < this.$items.length; i++) {
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

            for (var j = 0; j <= this.data.levels.length; j++) {
                this.createLevel(this.data.levels[j], j);
            }

            var toRemove = this.$items.length - this.data.levels.length - 1;
            if (toRemove > 0) {
                for (var k = this.data.levels.length + 1; k < this.$items.length; k++) {
                    this.$items[k].off();
                    this.levelButtons[k].off();
                }
                this.removeRow(this.data.levels.length + 2, toRemove);
                this.$items.splice(this.data.levels.length + 1, toRemove);
                this.levelButtons.splice(this.data.levels.length + 1, toRemove);
            }

        }
        this.invalidateLayout('both', Math.random());
        this.resumeLayout();

    };

    this.close = function() {
        for (var i = 0; i < this.$items.length; i++) {
            this.$items[i].off();
            this.levelButtons[i].off();
        }
        this.$closeButton.off();
    };

    this.listenForCompleteRemove = function($button) {
        var self = this;
        $button.click(function(event) {
            var index = $button.data("index");
            self.parent.onItemRemoved(index);
        });
    };

    this.listenForRemove = function($button) {
        var self = this;
        $button.click(function(event) {
            var index = $button.data("index");
            self.data.levels.splice(index, 1);
            self.parent.onItemChanged();
        });
    };

    this.listenForChange = function($item) {
        var self = this;
        $item.change((event) => {
            this.onChange($item);
        });
    };

    this.onChange = function($item) {
        var value = $item.val();
        var index = $item.data("index");
        this.data.levels[index] = value;
        this.parent.onItemChanged();
    };

    this.listenForLabelChange = function($item) {
        $item.change((event) => {
            this.labelChange($item);
        });
    };

    this.labelChange = function($item) {
        var value = $item.val();
        if (_.isUndefined(this.data) || this.data === null) {
            this.parent.onItemAdded({label: value, levels: ["Level 1", "Level 2"]});
        }
        else {
            this.data.label = value;
            this.parent.onItemChanged();
        }
    };
};

var RMAnovaFactorsControl = function(params) {
    GridOptionControl.extendTo(this, params);
    LayoutGrid.extendTo(this);

    this.$el.addClass('rmanova-factors-control');

    this.setAutoSizeHeight(false);
    this._animateCells = true;

    this.items = [];

    this.createFactorsObject = function(data, index, isVirtual) {

        var item = this.items[index];
        if (item === null || _.isUndefined(item)) {
            item = new rmafcItem(this, data, index === 0, isVirtual);
            item.render(index);

            var cell = this.addLayout(0, index, false, item);
            cell.setStretchFactor(1);

            this.items[index] = item;
        }
        else {
            item.updateData(data, index);
        }
    };

    this.onRenderToGrid = function(grid, row, column) {

        grid.addCell(column, row + 1, false, $('<div class="supplier-button-filler"></div>'));

        var label = this.getPropertyValue("label");
        if (label !== null)
            grid.addCell(column + 1, row, true, $('<div style="white-space: nowrap;" class="silky-rmanova-factors-header">' + label + '</div>'));

        var cell = grid.addLayout(column + 1, row + 1, true, this);
        cell.setStretchFactor(0.5);

        return { height: 2, width: 2 };
    };

    this.onOptionSet = function(option) {
        if (this.option.isValueInitialized()) {
            this.data = this.clone(this.option.getValue());
            this.updateData();
        }
    };

    this.data = [];


    this.onItemChanged = function(item) {
        this.option.setValue(this.data);
    };

    this.onItemAdded = function(data) {
        this.data.push(data);
        this.option.setValue(this.data);
    };

    this.onItemRemoved = function(index) {
        this.data.splice(index, 1);
        this.option.setValue(this.data);
    };

    this.onOptionValueInserted = function(keys, data) {
        var index = keys[0];
        this.insertRow(index, 1);
        var optionData = this.clone(this.option.getValue(keys));

        this.data.splice(index, 0, optionData);
        this.items.splice(index, 0, null);

        this.createFactorsObject(optionData, index, false);
    };

    this.onOptionValueRemoved = function(keys, data) {
        var index = keys[0];
        this.items.splice(index, 1);
        this.removeRow(index);
    };

    this.onOptionValueChanged = function(keys, data) {
        this.data = this.clone(this.option.getValue());
        this.updateData();
    };

    this.updateData = function() {

        if ((this.data === null || this.data.length === 0) && this.option.isValueInitialized())
            this.option.setValue([ {label: "RM Factor 1", levels: ["Level 1", "Level 2"] } ]);
        else {
            if (this.data === null)
                this.data = [];

            this.suspendLayout();
            for (var i = 0; i <= this.data.length; i++)
                this.createFactorsObject(this.data[i], i, i  === this.data.length);

            if (this.items.length > this.data.length + 1) {
                var countToRemove = this.items.length - this.data.length - 1;
                for (var j = this.data.length + 1; j < this.items.length; j++)
                    this.items[j].close();
                this.items.splice(this.data.length + 1, countToRemove);
                this.removeRow(this.data.length + 1, countToRemove);
            }
            this.resumeLayout();
        }

    };

    this.clone = function(object) {
        return JSON.parse(JSON.stringify(object));
    };



};

module.exports = RMAnovaFactorsControl;
