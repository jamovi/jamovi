'use strict';

import { createOptionControlBase } from './optioncontrolbase';
import { ControlContainer } from './controlcontainer';
const DefaultControls = require('./defaultcontrols');
import Opt from './option';
const ApplyMagicEventsForCtrl = require('./applymagicevents').applyMagicEventsForCtrl;
import { EventEmitter } from 'events';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

export class OptionsView extends EventEmitter {
    el: HTMLElement;
    _i18nSource: { translate: (key: string) => string };
    
    constructor(uiModel) {
        super();
        this.el = HTML.parse('<div class="silky-options-content" role="presentation"></div>');
        this.model = uiModel;
        this._allCtrls = [];
        this._loaded = false;
        this._initializingData = 0;
        this._requestedDataSource = null;
        this._i18nSource = null;
        this._ctrlListValid = true;
        this.q = 0;
        this._nextControlID = 0;
        this._templateCtrlNameCount = { };
    }

    render() {
        let options = this.model.options;
        let layoutDef = this.model.ui;

        if (layoutDef.stage <= this.model.currentStage) {
            this.layoutActionManager = this.model.actionManager;

            layoutDef._parentControl = null;
            let layoutGrid = new ControlContainer(layoutDef);
            layoutGrid.el.classList.add('top-level');
            //layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            //layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());

            layoutGrid.renderContainer(this);

            for (let i = 0; i < options._list.length; i++) {
                let option = options._list[i];
                let name = option.params.name;
                if (this.layoutActionManager.exists(name) === false) {
                    let ctrlDef = { name: name, typeName: '_hiddenOption', _parentControl: null };
                    ApplyMagicEventsForCtrl(ctrlDef, this.layoutActionManager._view);
                    let backgroundOption = createOptionControlBase(ctrlDef);
                    backgroundOption.setOption(this._getOption(name));
                    this.layoutActionManager.addResource(name, backgroundOption);
                }
            }

            this.layoutActionManager.addResource("view", this);

            this.layoutActionManager.fireCreateEvents(this);

            this.el.append(layoutGrid.el);

            window.setTimeout(() => {
                this._loaded = true;
                this.layoutActionManager.initializeAll();
                this.emit('loaded');
                for (let ctrlInfo of this._allCtrls) {
                    let ctrl = ctrlInfo.ctrl;
                    if (ctrl.onLoaded)
                        ctrl.onLoaded();
                }
            }, 0);
        }
        else {
            this.el.append(HTML.parse('<div class="silky-analysis-under-development">This analysis is currently in development and will be available very soon!</div>'));
        }
    }

    dataChanged(data) {
        for (let i = 0; i < this._allCtrls.length; i++) {
            let ctrl = this._allCtrls[i].ctrl;
            if (ctrl.isDisposed)
                continue;

            if (ctrl.onDataChanged)
                ctrl.onDataChanged(data);
        }
        this.emit("remote-data-changed", data);
    }

    _getOption(id) {
        let option = this.model.options.getOption(id);
        if (option === null)
            return null;

        return this._wrapOption(option, false);
    }

    _getVirtualOption() {
        return this._wrapOption(new Opt(null, { }), true);
    }

    _wrapOption(option, isVirtual) {
        if (option === null)
            return null;

        if (this._ctrlOptions === undefined)
            this._ctrlOptions = {};

        let options = this.model.options;

        let ctrlOption = null;
        if (option.name)
            ctrlOption =this._ctrlOptions[option.name];

        if ( ! ctrlOption) {
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
                                return { }; //throw "This option requires an 'elements' property to be considered an object.";

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
                                return { }; //throw "This option requires a 'template' property to be considered an array.";
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

                setProperty: function(propertyName, value, key, fragmentName) {
                    if (key === undefined)
                        key = [];

                    options.setPropertyValue(this.getName(), propertyName, value, key, fragmentName);
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

            if (option.name)
                this._ctrlOptions[option.name] = ctrlOption;
        }

        return ctrlOption;
    }
    
    setRequestedDataSource(source) {
        this._requestedDataSource = source;
    }

    setI18nSource(source: { translate: (key: string) => string }) {
        this._i18nSource = source;
    }

    _validateControlList() {
        this._ctrlListValid = true;
        let i = 0;
        while (i < this._allCtrls.length) {
            let ctrlInfo = this._allCtrls[i];
            let ctrl = ctrlInfo.ctrl;

            if (ctrl.isDisposed) {
                this._allCtrls.splice(i, 1);
                if (ctrlInfo.resourceId !== null)
                    this.model.actionManager.removeResource(ctrlInfo.resourceId);
            }
            else
                i += 1;
        }
    }

    createControl(uiDef, parent) {
        if (uiDef.type === undefined) {
            if (uiDef.controls !== undefined)
                uiDef.type = DefaultControls.LayoutBox;
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        let name = uiDef.name === undefined ? null :  uiDef.name;

        uiDef.DefaultControls = DefaultControls;
        uiDef._parentControl = parent;

        let templateInfo = uiDef._templateInfo;
        if (uiDef._templateInfo === undefined)
            templateInfo = parent.getTemplateInfo();

        if (templateInfo !== null) {
            name = null;
            uiDef._templateInfo = templateInfo;
        }

        if (uiDef.controlID !== undefined)
            throw 'This control definition has already been assigned a control id. It has already been used by a control';

        uiDef.controlID = this._nextControlID++;
        let ctrl = null;
        if (uiDef.type.create)
            ctrl = uiDef.type.create(uiDef);
        else
            ctrl = new uiDef.type(uiDef);

        if (ctrl === null)
            throw "shouldn't get here";

        if (ctrl.getPropertyValue("stage") > this.model.currentStage)
            return null;

        if (ctrl.setRequestedDataSource)
            ctrl.setRequestedDataSource(this._requestedDataSource);
        
        if (ctrl.setControlManager)
            ctrl.setControlManager(this);
        
        if (uiDef.name !== undefined || ctrl.hasProperty("optionName")) {
            if (ctrl.setOption) {
                let id = ctrl.getPropertyValue("optionName");
                let isVirtual = false;
                if (id === null) {
                    id = name;
                    isVirtual = ctrl.getPropertyValue("isVirtual");
                }
                let option = null;
                if (isVirtual)
                    option = this._getVirtualOption();
                else if (templateInfo !== null)
                    option = templateInfo.parent.option;
                else
                    option = this._getOption(id);

                if (option !== null)
                    ctrl.setOption(option);
            }
        }

        if (ctrl.setI18nSource)
            ctrl.setI18nSource(this._i18nSource);

        let resourceId = null;
        if (ctrl !== null) {
            if (ctrl.params.contentLink)
                ctrl = ctrl;
            resourceId = this.model.actionManager.addResource(name, ctrl);
        }

        ctrl.on('disposing', () => {
            if (this._ctrlListValid === true) {
                this._ctrlListValid = false;
                setTimeout(() => { this._validateControlList(); }, 0);
            }
        });


        this._allCtrls.push( { ctrl: ctrl, resourceId: resourceId } );
        return ctrl;
    }

    beginDataInitialization(id) {
        if (this._loaded === false)
            return false;

        this._initializingData += 1;
        this.emit("data-initializing", { id: id });
        this.model.actionManager.beginInitializingData();

        return true;
    }

    endDataInitialization(id) {
        if (this._loaded === false || this._initializingData === 0)
            return false;

        this._initializingData -= 1;
        this.model.actionManager.endInitializingData();

        for (let ctrlInfo of this._allCtrls) {
            let ctrl = ctrlInfo.ctrl;
            if (ctrl.isDisposed)
                continue;

            if (ctrl.update)
                ctrl.update();
        }

        this.emit("ready", { id: id });

        return true;
    }

    isLoaded() {
        return this._loaded;
    }
}

export default OptionsView;
