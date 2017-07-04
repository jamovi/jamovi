'use strict';

const _ = require('underscore');
const $ = require('jquery');

const OptionControlBase = require('./optioncontrolbase');
const ControlContainer = require('./controlcontainer').container;
const DefaultControls = require('./defaultcontrols');
const Backbone = require('backbone');
const Opt = require('./option');

const OptionsView = function(uiModel) {

    Object.assign(this, Backbone.Events);

    this.$el = $('<div class="silky-options-content"></div>');

    this.model = uiModel;
    this._allCtrls = [];
    this._loaded = false;
    this._initializingData = 0;

    this.render = function() {
        let options = this.model.options;
        let layoutDef = this.model.ui;

        if (layoutDef.stage <= this.model.currentStage) {
            this.layoutActionManager = this.model.actionManager;

            layoutDef._parentControl = null;
            let layoutGrid = new ControlContainer(layoutDef);
            layoutGrid.$el.addClass('top-level');
            layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            layoutGrid._animateCells = true;

            layoutGrid.renderContainer(this);

            layoutGrid.render();

            this.$el.append(layoutGrid.$el);

            for (let i = 0; i < options._list.length; i++) {
                let option = options._list[i];
                let name = option.params.name;
                if (this.layoutActionManager.exists(name) === false) {
                    let backgroundOption = new OptionControlBase( { name: name, _parentControl: null });
                    backgroundOption.setOption(this._getOption(name));
                    this.layoutActionManager.addResource(name, backgroundOption);
                }
            }

            this.layoutActionManager.addResource("view", this);

            window.setTimeout(() => {
                this._loaded = true;
                this.layoutActionManager.initializeAll();
                this.trigger('loaded');
            }, 0);
        }
        else {
            this.$el.append('<div class="silky-analysis-under-development">This analysis is currently in development and will be available very soon!</div>');
        }
    };

    this.dataChanged = function(data) {
        for (let i = 0; i < this._allCtrls.length; i++) {
            let ctrl = this._allCtrls[i];
            if (ctrl.isDisposed)
                continue;

            if (ctrl.onDataChanged)
                ctrl.onDataChanged(data);
        }
        this.trigger("remote-data-changed", data);
    };

    this._getOption = function(id) {
        let option = this.model.options.getOption(id);
        if (option === null)
            return null;

        return this._wrapOption(option, false);
    };

    this._getVirtualOption = function(params) {

        let ctrlOption = this._ctrlOptions[params.name];
        if (ctrlOption === undefined)
            return this._wrapOption(new Opt(null, params), true);

        return ctrlOption;
    };

    this._wrapOption = function(option, isVirtual) {
        if (option === null)
            return null;

        if (this._ctrlOptions === undefined)
            this._ctrlOptions = {};

        let options = this.model.options;

        let ctrlOption = this._ctrlOptions[option.name];
        if (ctrlOption === undefined) {
            ctrlOption = {

                source: option,

                getProperties: function(key, fragmentName) {
                    if (key === undefined)
                        key = [];

                    let properties = option.params;
                    for (let i = 0; i < key.length; i ++) {
                        let keyItem = key[i];
                        if (typeof keyItem === 'string') {
                            let list = null;
                            if (properties.elements !== undefined)
                                list = properties.elements;
                            else
                                throw "This option requires an 'elements' property to be considered an object.";

                            let found = false;
                            for (let e = 0; e < list.length; e++) {
                                let item = list[e];
                                if (item.name === keyItem) {
                                    properties = item;
                                    found = true;
                                    break;
                                }
                            }
                            if (found === false)
                                throw "This option does not contain this key.";
                        }
                        else if (typeof keyItem === 'number'){
                            if (properties.template === undefined)
                                throw "This option requires a 'template' property to be considered an array.";
                            properties = properties.template;
                        }
                        else
                            throw "This type is not supported as a key item.";
                    }

                    if (fragmentName) {
                        let list = null;
                        if (properties.options !== undefined)
                            list = properties.options;
                        else
                            throw "This option requires an 'options' property to be considered an fragmentable option.";

                        let found = false;
                        for (let e = 0; e < list.length; e++) {
                            let item = list[e];
                            if ((typeof item === 'string' && item === fragmentName) || (typeof item === 'object' && item.name === fragmentName)) {
                                properties = item;
                                found = true;
                                break;
                            }
                        }
                        if (found === false)
                            throw "This option does not contain this fragment.";
                    }

                    return properties;
                },

                isVirtual: isVirtual,

                beginEdit: function() {
                    if (isVirtual === false)
                        options.beginEdit();
                },

                endEdit: function() {
                    if (isVirtual === false)
                        options.endEdit();
                },

                insertValueAt: function(value, key, eventParams) {
                    if (isVirtual)
                        option.insertValueAt(value, key);
                    else
                        options.insertOptionValue(option, value, key, eventParams);
                },

                removeAt: function(key, eventParams) {
                    if (isVirtual)
                        option.removeAt(key);
                    else
                        options.removeOptionValue(option, key, eventParams);
                },

                setValue: function(value, key, eventParams) {
                    if (isVirtual)
                        option.setValue(value, key);
                    else
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
                },

                isValidKey: function(key) {
                    return option.isValidKey(key);
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

            if (ctrl.isDisposed) {
                this._allCtrls.splice(i, 1);
                if (ctrl.hasProperty('name'))
                    this.model.actionManager.removeResource(ctrl.getPropertyValue('name'));
            }
            else
                i += 1;
        }
    };

    this.createControl = function(uiDef, parent) {
        if (uiDef.type === undefined) {
            if (uiDef.controls !== undefined)
                uiDef.type = DefaultControls.LayoutBox;
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        uiDef._parentControl = parent;

        let templateInfo = uiDef._templateInfo;
        if (uiDef._templateInfo === undefined)
            templateInfo = parent.getTemplateInfo();

        if (templateInfo !== null) {
            if (uiDef.name !== undefined)
                uiDef.name = uiDef.name + "_" + templateInfo.name + "_" + templateInfo.instanceId;
            else
                uiDef.name = "_" + templateInfo.name + "_" + templateInfo.instanceId;
            uiDef._templateInfo = templateInfo;
        }

        let ctrl = new uiDef.type(uiDef);

        if (ctrl.getPropertyValue("stage") > this.model.currentStage)
            return null;

        ctrl._override("onDisposed", (baseFunction) => {
            if (baseFunction !== null)
                baseFunction.call(this);

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

        if (uiDef.name === undefined && ctrl.hasProperty("optionName") === false)
            return ctrl;

        let name = uiDef.name;
        if (ctrl.setOption) {
            let id = ctrl.getPropertyValue("optionName");
            let isVirtual = false;
            if (id === null) {
                id = name;
                isVirtual = ctrl.getPropertyValue("isVirtual");
            }
            let option = null;
            if (isVirtual)
                option = this._getVirtualOption({ name:id });
            else if (templateInfo !== null)
                option = templateInfo.parent.option;
            else
                option = this._getOption(id);

            if (option !== null)
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
