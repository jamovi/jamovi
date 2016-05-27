'use strict';

var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
var LayoutGrid = require('./layoutgrid').Grid;
var LayoutGroupView = require('./layoutgroupview');
var LayoutVariablesView = require('./layoutvariablesview');
var Options = require('./options');
var GridCheckbox = require('./gridcheckbox');
var GridRadioButton = require('./gridradiobutton');
var GridTextbox = require('./gridtextbox');
var GridVariablesTargetList =  require('./gridvariablestargetlist');
Backbone.$ = $;

var OptionsView = Backbone.View.extend({

    renderLayout: function(items, groupView, currentStyle, level) {
        var _nextCell = {row: 0, column: 0};
        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var isGroup = _.isUndefined(item.items) === false;

            if (isGroup === true) {
                var cell = item.cell;
                if (_.isUndefined(cell) === false) {
                    _nextCell.row = cell[1];
                    _nextCell.column = cell[0];
                }

                var groupType = item.type;
                if ( ! groupType)
                    groupType = "group";

                var labeledGroup = _.isUndefined(item.label) === false;

                var itemLevel = _.isUndefined(item.level) ? level : item.level;

                var newGroup = null;
                if (_.isUndefined(this["createLayoutView_" + groupType]) === false)
                    newGroup = this["createLayoutView_" + groupType](itemLevel, item);
                else
                    newGroup = this.createLayoutView_group(itemLevel, item);

                var groupCell = groupView.addLayout(item.name + '_group', _nextCell.column, _nextCell.row, true, newGroup);

                if (itemLevel === 0) {
                    newGroup._animateCells = true;
                }
                else if (itemLevel === 1) {
                    groupCell.fitToGrid = false;
                    groupCell.horizontalStretchFactor = 1;
                    groupCell.dockContentWidth = true;
                    this._animateCells = true;
                }

                if (_.isUndefined(item.stretchFactor) === false)
                    groupCell.horizontalStretchFactor = item.stretchFactor;

                if (_.isUndefined(item.fitToGrid) === false)
                    groupCell.fitToGrid = item.fitToGrid;

                if (_.isUndefined(item.dockContentWidth) === false)
                    groupCell.dockContentWidth = item.dockContentWidth;

                var nextLevel = labeledGroup ? itemLevel + 1 : itemLevel;

                this.renderLayout(item.items, newGroup, newGroup.style, nextLevel);

                _nextCell.row += 1;
            }
            else {

                var name = item.name;
                var option = this.model.options.getOption(name);
                if (option === null) {
                    console.log("The option " + name + " does not exist.");
                    continue;
                }

                var cellRange = this._insertControl(this.getCtrlOption(option), item, groupView, _nextCell.row, _nextCell.column);

                if (currentStyle === 'inline') {
                    _nextCell.row = 0;
                    _nextCell.column = _nextCell.column + cellRange.width;
                }
                else {
                    _nextCell.row = _nextCell.row + cellRange.height;
                    _nextCell.column = 0;
                }
            }
        }
    },

    createLayoutView_group: function(level, item) {

        var name = item.name;
        var style = item.style;
        if ( ! style)
            style = "list";

        var option = this.model.options.getOption(name);

        var newGroup = new LayoutGroupView(item);
        newGroup.setInfo(style, level);

        var $header = null;


        if (option !== null) {
            if (level === 1)
                throw "An option cannot be a level 1 heading.";

            $header = this._createControl(this.getCtrlOption(option), item);
            if ($header === null)
                throw "A group header cannot be of this type.";
        }
        else {
            var groupText = this.model.layoutDef.getGroupText(item);
            if (groupText) {
                var t = '';
                if (level === 1)
                    t = '<div class="silky-options-collapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
                $header = $('<div class="silky-options-h' + level + '" style="white-space: nowrap;">' + t + groupText + '</div>');
            }
        }

        if ($header !== null) {
            $header.addClass("silky-options-group-header silky-options-group-header"  + level);
            var cell = newGroup.addHeader($header);
            if (level === 1) {
                cell.horizontalStretchFactor = 1;
                cell.dockContentWidth = true;
                $header.on('click', null, newGroup, function(event) {
                    var group = event.data;
                    //if (group.level === 1)
                        group.toggleColapsedState();
                });
            }
        }

        newGroup.$el.addClass("silky-options-group silky-options-level-" + level + " silky-options-group-style-" + style);

        return newGroup;
    },

    createLayoutView_supplier: function(level, item) {

        var style = "list";

        var newGroup = new LayoutVariablesView(item);
        newGroup.setInfo(this.model.resources, style, level);

        newGroup.$el.addClass("silky-options-group silky-options-level-" + level + " silky-options-group-style-" + style);

        return newGroup;
    },

    render: function() {
        var options = this.model.options;
        var layoutDef = this.model.layoutDef;


        var layoutGrid = new LayoutGrid();
        layoutGrid.$el.addClass('silky-layout-grid top-level');
        layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
        layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
        layoutGrid._animateCells = true;

        this.renderLayout(layoutDef.layout, layoutGrid, 'list', 1);

        layoutGrid.render();

        this.$el.append(layoutGrid.$el);
    },


    getCtrlOption : function(option) {
        if (_.isUndefined(this._ctrlOptions))
            this._ctrlOptions = {};

        var self = this;
        var layoutDef = this.model.layoutDef;
        var options = this.model.options;
        var ctrlOption = this._ctrlOptions[option.name];
        if (_.isUndefined(ctrlOption)) {
            ctrlOption = {

                source: option,

                getTitle: function() {
                    return layoutDef.getTitle();
                },

                beginEdit: function() {
                    options.beginEdit();
                },

                endEdit: function() {
                    options.endEdit();
                },

                insertValueAt: function(value, key, eventParams) {
                    options.insertOptionValue(option, value, key, eventParams);
                },

                removeAt: function(key, eventParams) {
                    options.removeOptionValue(option, key, eventParams);
                },

                setValue: function(value, key, eventParams) {
                    options.setOptionValue(option, value, key, eventParams);
                },

                getLength: function(key) {
                    return option.getLength(key);
                },

                getValue: function(key) {
                    return option.getValue(key);
                },

                getFormattedValue: function(key, format) {
                    return option.getFormattedValue(key, format);
                },

                getValueAsString: function() {
                    return option.toString();
                },

                getName: function() {
                    return option.name;
                },

                valueInited: function() {
                    return option.valueInited();
                }
            };
            this._ctrlOptions[option.name] = ctrlOption;
        }

        return ctrlOption;
    },


    _createControl: function(ctrlOption, uiDef) {
        var $t = null;
        var createFunction = this['_createControl_' + uiDef.type];
        if (createFunction)
            $t = createFunction.call(this, ctrlOption, uiDef);

        return $t;
    },

    _createControl_checkbox: function(ctrlOption, uiDef) {
        var checkbox = new GridCheckbox(ctrlOption, uiDef);
        return checkbox.$el;
    },

    _createControl_radiobutton: function(ctrlOption, uiDef) {
        var radioButton = new GridRadioButton(ctrlOption, uiDef);
        return radioButton.$el;
    },


    _insertControl: function(ctrlOption, uiDef, group, row, column) {
        var t = { height: 0, width: 0 };
        var insertFunction = this['_insertControl_' + uiDef.type];
        if (insertFunction)
            t = insertFunction.call(this, ctrlOption, uiDef, group, row, column);

        return t;
    },

    _insertControl_textbox: function(ctrlOption, uiDef, grid, row, column) {
        var textbox = new GridTextbox(ctrlOption, uiDef);
        return textbox.render(grid, row, column);
    },

    _insertControl_listbox: function(ctrlOption, uiDef, grid, row, column) {
        var targetList = new GridVariablesTargetList(ctrlOption, uiDef);
        if (grid.addTarget) {
            targetList.setSupplier(grid);
            grid.addTarget(targetList);
        }
        return targetList.render(grid, row, column);
    },

    _insertControl_checkbox: function(ctrlOption, uiDef, grid, row, column) {
        var checkbox = new GridCheckbox(ctrlOption, uiDef);
        return checkbox.render(grid, row, column);
    },

    _insertControl_radiobutton: function(ctrlOption, uiDef, grid, row, column) {
        var radiobutton = new GridRadioButton(ctrlOption, uiDef);
        return radiobutton.render(grid, row, column);
    }

});


module.exports = OptionsView;
