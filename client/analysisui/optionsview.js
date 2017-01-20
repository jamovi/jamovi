'use strict';

var _ = require('underscore');
var $ = require('jquery');

var OptionControlBase = require('./optioncontrolbase');
var ControlContainer = require('./controlcontainer');
var DefaultControls = require('./defaultcontrols');
var Backbone = require('backbone');


var OptionsView = function(uiModel) {

    _.extend(this, Backbone.Events);

    this.$el = $('<div class="silky-options-content"></div>');

    this.model = uiModel;
    this._allCtrls = [];
    this._loaded = false;
    this._initializingData = 0;

    this.render = function() {
        var options = this.model.options;
        var layoutDef = this.model.ui;

        if (layoutDef.stage <= this.model.currentStage) {
            this.layoutActionManager = this.model.actionManager;

            var layoutGrid = new ControlContainer(layoutDef);
            layoutGrid.$el.addClass('top-level');
            layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            layoutGrid._animateCells = true;

            layoutGrid.renderContainer(this);

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

            this.layoutActionManager.addResource("view", this);

            var self = this;
            window.setTimeout(function() {
                self._loaded = true;
                self.layoutActionManager.initializeAll();
                self.trigger('loaded');
            }, 0);
        }
        else {
            this.$el.append('<div class="silky-analysis-under-development">This analysis is currently in development and will be available very soon!</div>');
        }
    };

    this.dataChanged = function(data) {
        for (let i = 0; i < this._allCtrls.length; i++) {
            let ctrl = this._allCtrls[i];
            if (ctrl.onDataChanged)
                ctrl.onDataChanged(data);
        }
        this.trigger("remote-data-changed", data);
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

                getProperties: function() {
                    return option.params;
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

                isValueInitialized: function() {
                    return option.isValueInitialized();
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

    this._requestedDataSource = null;
    this.setRequestedDataSource = function(source) {
        this._requestedDataSource = source;
    };

    this._ctrlListValid = true;

    this._validateControlList = function() {
        this._ctrlListValid = true;
        let i = 0;
        while (i < this._allCtrls.length) {
            let ctrl = this._allCtrls[i];
            if (ctrl.isDisposed)
                this._allCtrls.splice(i, 1);
            else
                i += 1;
        }
    };

    this.createSubControl = function(uiDef) {
        if (uiDef.type === undefined) {
            if (uiDef.controls !== undefined)
                uiDef.type = DefaultControls.LayoutBox;
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        var ctrl = new uiDef.type(uiDef);


        ctrl._override("onDisposed", () => {
            if (this._ctrlListValid === true) {
                this._ctrlListValid = false;
                setTimeout(() => { this._validateControlList(); }, 0);
            }
        });

        if (ctrl.setRequestedDataSource)
            ctrl.setRequestedDataSource(this._requestedDataSource);

        if (ctrl.setControlManager)
            ctrl.setControlManager(this);

        this._allCtrls.push(ctrl);

        return ctrl;
    };

    this.createControl = function(uiDef) {
        if (uiDef.type === undefined) {
            if (uiDef.controls !== undefined)
                uiDef.type = DefaultControls.LayoutBox;
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        var ctrl = new uiDef.type(uiDef);

        if (ctrl.getPropertyValue("stage") > this.model.currentStage)
            return null;

            ctrl._override("onDisposed", () => {
                if (this._ctrlListValid === true) {
                    this._ctrlListValid = false;
                    setTimeout(() => { this._validateControlList(); }, 0);
                }
            });

        if (ctrl.setRequestedDataSource)
            ctrl.setRequestedDataSource(this._requestedDataSource);

        if (ctrl.setControlManager)
            ctrl.setControlManager(this);

        this._allCtrls.push(ctrl);

        if (ctrl.hasProperty("name") === false)
            return ctrl;

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

    this.beginDataInitialization = function() {
        if (this._loaded === false)
            return false;

        this._initializingData += 1;
        this.trigger("data-initializing");
        this.model.actionManager.beginInitializingData();

        return true;
    };

    this.endDataInitialization = function() {
        if (this._loaded === false || this._initializingData === 0)
            return false;

        this._initializingData -= 1;
        this.model.actionManager.endInitializingData();
        this.trigger("ready");

        return true;
    };

    this.isLoaded = function() {
        return this._loaded;
    };
};


module.exports = OptionsView;
