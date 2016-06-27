'use strict';

var _ = require('underscore');
var $ = require('jquery');

var OptionControlBase = require('./optioncontrolbase');
var ControlContainer = require('./controlcontainer');


var OptionsView = function(uiModel) {

    this.$el = $('<div class="silky-options-content"></div>');

    this.model = uiModel;
    this.resources = this.model.resources;

    this.render = function() {
        var options = this.model.options;
        var layoutDef = this.model.layoutDef;

        /*if (_.isUndefined(this.layoutActionManager) === false)
            this.layoutActionManager.close();*/

        this.layoutActionManager = this.model.actionManager;

        var layoutGrid = new ControlContainer(layoutDef);
        layoutGrid.$el.addClass('top-level');
        layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
        layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
        layoutGrid._animateCells = true;

        layoutGrid.renderContainer(this, 1);

        layoutGrid.render();

        this.$el.append(layoutGrid.$el);

        for (var i = 0; i < options._list.length; i++) {
            var option = options._list[i];
            var name = option.params.name;
            if (this.layoutActionManager.exists(name) === false) {
                var backgroundOption = new OptionControlBase( { name: name });
                backgroundOption.setOption(this._getOption(name));
                this.layoutActionManager.addResource(name, backgroundOption);
            }
        }

        var self = this;
        window.setTimeout(function() {
            self.layoutActionManager.initialiseAll();
        }, 0);
    };

    this._getOption = function(id) {
        if (_.isUndefined(this._ctrlOptions))
            this._ctrlOptions = {};

        var self = this;
        var options = this.model.options;
        var option = options.getOption(id);
        if (option === null)
            return null;

        var ctrlOption = this._ctrlOptions[option.name];
        if (_.isUndefined(ctrlOption)) {
            ctrlOption = {

                source: option,

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
    };

    this.createControl = function(uiDef) {
        if (_.isUndefined(uiDef.type)) {
            if (_.isUndefined(uiDef.controls) === false)
                uiDef.type = "collection";
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        var ctrl = this.model.controls.create(uiDef.type, uiDef);

        if (ctrl.getPropertyValue("stage") !== "release")
            return null;

        var name = ctrl.getPropertyValue("name");
        if (ctrl.setOption) {
            var id = ctrl.getPropertyValue("optionId");
            if (id === null)
                id = name;
            var option = this._getOption(id);
            if (option === null) {
                console.log("The option " + id + " does not exist.");
                ctrl = null;
            }
            else
                ctrl.setOption(option);
        }

        if (ctrl !== null && name !== null)
            this.model.actionManager.addResource(uiDef.name, ctrl);

        return ctrl;
    };
/*
    this.createControl = function(uiDef) {

        var id = uiDef.optionId;
        if (_.isUndefined(id))
            id = uiDef.name;
        var option = this._getOption(id);
        if (option === null) {
            console.log("The option " + id + " does not exist.");
            return null;
        }

        var ctrl = this.model.controls.create(uiDef.type, option, uiDef);
        if (ctrl !== null)
            this.model.actionManager.addResource(uiDef.name, ctrl);

        return ctrl;
    };

    this.createContainer = function(uiDef) {
        var ctrl = this.model.controls.create(uiDef.type, this, uiDef);
        if (ctrl !== null)
            this.model.actionManager.addResource(uiDef.name, ctrl);

        return ctrl;
    };
*/
};


module.exports = OptionsView;
