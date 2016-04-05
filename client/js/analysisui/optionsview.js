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

    renderLayout: function(items, groupView, currentFormat, level) {
        this._nextCell = {row: 0, column: 0};
        for (var i = 0; i < items.length; i++) {
            var item = items[i];

            var isGroup = _.isUndefined(item.items) === false;

            if (isGroup === true) {
                var cell = item.cell;
                var groupType = item.type;
                if (!groupType)
                    groupType = "group";

                var newGroup = null;
                if (_.isUndefined(this["createLayoutView_" + groupType]) === false)
                    newGroup = this["createLayoutView_" + groupType](level, item);
                else
                    newGroup = this.createLayoutView_group(level, item);

                var groupCell = groupView.addLayout(item.name + '_group', cell[0], cell[1], true, newGroup);
                if (level === 1) {
                    groupCell.fitToGrid = false;
                    groupCell.horizontalStretchFactor = 1;
                    groupCell.dockContentWidth = true;
                }

                this.renderLayout(item.items, newGroup, newGroup.format, level + 1);
            }
            else {

                var name = item.name;
                var option = this.model.options.getOption(name);
                if (option === null) {
                    console.log("The option " + name + " does not exist.");
                    continue;
                }

                var cellRange = this._insertControl(this.getCtrlOption(option), item, groupView, this._nextCell.row, this._nextCell.column);

                if (currentFormat === 'inline') {
                    this._nextCell.row = 0;
                    this._nextCell.column = this._nextCell.column + cellRange.width;
                }
                else {
                    this._nextCell.row = this._nextCell.row + cellRange.height;
                    this._nextCell.column = 0;
                }
            }
        }
    },

    createLayoutView_group: function(level, item) {

        var name = item.name;
        var format = item.format;
        if (!format)
            format = "list";

        var option = this.model.options.getOption(name);

        var newGroup = new LayoutGroupView();
        newGroup.setInfo(format, level);

        var $header = null;


        if (option !== null) {
            if (level === 1)
                throw "An option cannot be a level 1 heading.";

            $header = this._createControl(this.getCtrlOption(option), item);
            if ($header === null)
                throw "A group header cannot be of this type.";
        }
        else {
            var groupText = this.model.layoutdef.getGroupText(name);
            if (groupText) {
                var t = '';
                if (level === 1)
                    t = '<div class="silky-options-colapse-icon" style="display: inline;"> <span class="silky-dropdown-toggle"></span></div>';
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

        newGroup.$el.addClass("silky-options-group silky-options-level-" + level + " silky-options-group-format-" + format);

        return newGroup;
    },

    createLayoutView_supplier: function(level, item) {

        var format = "list";

        var newGroup = new LayoutVariablesView();
        newGroup.setInfo(this.model.resources, format, level);

        newGroup.$el.addClass("silky-options-group silky-options-level-" + level + " silky-options-group-format-" + format);

        return newGroup;
    },

    render: function() {
        var options = this.model.options;
        var layoutdef = this.model.layoutdef;


        var layoutGrid = new LayoutGrid();
        layoutGrid.setFixedWidth(this.$el.width() - layoutGrid.getScrollbarWidth());

        this.renderLayout(layoutdef.layout, layoutGrid, 'list', 1);

        layoutGrid.render();

        this.$el.append(layoutGrid.$el);
    },


    getCtrlOption : function(option) {
        if (_.isUndefined(this._ctrlOptions))
            this._ctrlOptions = {};

        var self = this;
        var layoutdef = this.model.layoutdef;
        var options = this.model.options;
        var ctrlOption = this._ctrlOptions[option.name];
        if (_.isUndefined(ctrlOption)) {
            ctrlOption = {

                source: option,

                getTitle: function() {
                    return layoutdef.getTitle();
                },

                getGroupText: function(id) {
                    return layoutdef.getGroupText(id);
                },

                getText: function() {
                    return layoutdef.getOptionText(option.name);
                },

                getSuffix: function() {
                    return layoutdef.getOptionSuffix(option.name);
                },

                insertValueAt: function(value, keys, eventParams) {
                    options.insertOptionValue(option, value, keys, eventParams);
                },

                setValue: function(value, keys, eventParams) {
                    options.setOptionValue(option, value, keys, eventParams);
                },

                getValue: function(keys) {
                    return option.getValue(keys);
                },

                getValueAsString: function() {
                    return option.toString();
                },

                getName: function() {
                    return option.name;
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
        targetList.setSupplier(grid);
        grid.addTarget(targetList);
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
