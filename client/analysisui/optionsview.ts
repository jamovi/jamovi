'use strict';

import OptionControlBase, { OptionControlBaseProperties } from './optioncontrolbase';
import { ControlContainer } from './controlcontainer';
import DefaultControls from './defaultcontrols';
import Opt from './option';
import { applyMagicEventsForCtrl as ApplyMagicEventsForCtrl } from './applymagicevents';
import { DefaultEventMap, EventEmitter } from 'tsee';
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';
import Options from './options';
import PropertySupplier, { EventHandlers } from './propertysupplier';
import LayoutActionManager from './layoutactionmanager';
import GridRunButton, { GridRunButtonProperties, IsGridRunButtonProperties } from './gridrunbutton';
import { TranslateFunction } from '../common/i18n';

export class ControlOption<T> {
    options: Options;
    source: Opt<T>;
    isVirtual: boolean;

    constructor(_option: Opt<T>, _options: Options, _isVirtual: boolean) {
        this.options = _options;
        this.source = _option;
        this.isVirtual = _isVirtual;
    }

    getProperties(key, fragmentName) {
        if (key === undefined)
            key = [];

        let properties = this.source.params;
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
    }

    setProperty(propertyName, value, key, fragmentName) {
        if (key === undefined)
            key = [];

        this.options.setPropertyValue(this.getName(), propertyName, value, key, fragmentName);
    }

    runInEditScope(fn: () => void) {
        this.beginEdit();
        try {
            fn();
        } finally {
            this.endEdit();
        }
    }

    beginEdit() {
        if (this.isVirtual === false)
            this.options.beginEdit();
    }

    endEdit() {
        if (this.isVirtual === false)
            this.options.endEdit();
    }

    insertValueAt(value, key, eventParams?) {
        if (this.isVirtual)
            this.source.insertValueAt(value, key);
        else
            this.options.insertOptionValue(this.source, value, key, eventParams);
    }

    removeAt(key, eventParams?) {
        if (this.isVirtual)
            this.source.removeAt(key);
        else
            this.options.removeOptionValue(this.source, key, eventParams);
    }

    setValue(value, key, eventParams?) {
        if (this.isVirtual)
            this.source.setValue(value, key);
        else
            this.options.setOptionValue(this.source, value, key, eventParams);
    }

    isValueInitialized() {
        return this.source.isValueInitialized();
    }

    getLength(key) {
        return this.source.getLength(key);
    }

    getValue(): T;
    getValue(key: any): any;
    getValue(key?: any): any {
        return this.source.getValue(key);
    }

    getFormattedValue(key, format) {
        return this.source.getFormattedValue(key, format);
    }

    getValueAsString() {
        return this.source.toString();
    }

    getName() {
        return this.source.name;
    }

    valueInited() {
        return this.source.valueInited();
    }

    isValidKey(key) {
        return this.source.isValidKey(key);
    }
}

export interface IControlProvider {
    createControl: <P extends CtrlDef>(uiDef: P, parent) => Control<P>;
}

interface ControlFactory<P extends CtrlDef> {
    new (params: P, parent: any): Control<P>;
    create: (def: P, parent: any) => Control<P>;
}

interface ControlClass<P extends CtrlDef> {
    new (params: P, parent: any): Control<P>;
    create?: (params: P, parent: any) => Control<P>;
} 

interface IControl {
    onLoaded?: () => void;
    isDisposed: boolean;
    onDataChanged?: (data: any) => void;
    update?: () => void;
    //getPropertyValue: (name: string) => any;
    setRequestedDataSource?: (dataSource: any) => void;
    setControlManager?: (constext: IControlProvider) => void;
    //hasProperty: (name: string) => boolean;
    setOption?: (option: ControlOption<any>, valueKey?) => void;
    setI18nSource?: (source: { translate: (key: string) => string }) => void;
    //params: any;
    [key: string]: any;
    //DefaultControls?: {[key: string]: ControlType<CtrlDef>};
} 

export interface ISingleCellControl {
    el: HTMLElement;
}

export type Control<P extends CtrlDef> = IControl & EventEmitter<EventHandlers<P>> & PropertySupplier<P>;

export type ControlType<P extends CtrlDef> = ControlClass<P> | ControlFactory<P>;

interface CtrlDefBase {
    [key: string]: any;
    //DefaultControls?: {[key: string]: ControlType<CtrlDef>};
};

interface TypeCtrlDef extends CtrlDefBase {
    type: ControlClass<CtrlDef>;
    controls?: any[];
};

interface ParentCtrlDef extends CtrlDefBase {
    controls: any[];
    type?: ControlClass<CtrlDef>;
};

export type CtrlDef = /*(TypeCtrlDef | ParentCtrlDef) &*/ {
    name?: string;
    controlID?: number;
    isVirtual: boolean;
    stage: 0 | 1 | 2;
    optionName?: string;
    controls?: any[];
    type?: ControlClass<CtrlDef>;
    _templateInfo? : any;
};

export interface IOptionsViewModel { 
    options: Options, 
    ui: any, 
    actionManager: LayoutActionManager, 
    currentStage: number; 
}

export class OptionsView extends EventEmitter implements IControlProvider {
    el: HTMLElement;
    /**
     * @deprecated Should not be used. Rather use `(property) Control.el: HTMLElement`.
     */
    $el: any
    _i18nSource: { translate: TranslateFunction } = null;
    _nextControlID = 0;
    _loaded = false;
    _allCtrls: { ctrl: Control<any>, resourceId: number }[] = [];
    _initializingData = 0;
    _ctrlListValid = true;
    _requestedDataSource = null;
    model: IOptionsViewModel;
    _ctrlOptions: {[key:string]: ControlOption<any>};
    layoutActionManager: any;
    runActionButton: GridRunButton = null;
    
    constructor(uiModel: IOptionsViewModel) {
        super();
        this.el = HTML.parse('<div class="silky-options-content" role="presentation"></div>');
        this.model = uiModel;
    }

    render() {
        let options = this.model.options;
        let layoutDef = this.model.ui;

        if (layoutDef.stage <= this.model.currentStage) {
            this.layoutActionManager = this.model.actionManager;

            let layoutGrid = new ControlContainer(layoutDef, null);
            layoutGrid.el.classList.add('top-level');
            //layoutGrid.setMinimumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());
            //layoutGrid.setMaximumWidth(this.$el.width() - layoutGrid.getScrollbarWidth());

            layoutGrid.renderContainer(this);

            for (let i = 0; i < options._list.length; i++) {
                let option = options._list[i];
                let name = option.params.name;
                if (this.layoutActionManager.exists(name) === false) {
                    let ctrlDef = { name: name, typeName: '_hiddenOption' };
                    ApplyMagicEventsForCtrl(ctrlDef, this.layoutActionManager._view);
                    let backgroundOption = new OptionControlBase(ctrlDef, null);
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

    _getOption(id: string | number): ControlOption<any> {
        let option = this.model.options.getOption(id);
        if (option === null)
            return null;

        return this._wrapOption(option, false);
    }

    _getVirtualOption(): ControlOption<any> {
        return this._wrapOption(new Opt(null, { }), true);
    }

    _wrapOption<T>(option: Opt<T>, isVirtual): ControlOption<T> {
        if (option === null)
            return null;

        if (this._ctrlOptions === undefined)
            this._ctrlOptions = {};

        let options = this.model.options;

        let ctrlOption: ControlOption<T> = null;
        if (option.name)
            ctrlOption =this._ctrlOptions[option.name];

        if ( ! ctrlOption) {
            ctrlOption = new ControlOption<T>(option, options, isVirtual);

            if (option.name)
                this._ctrlOptions[option.name] = ctrlOption;
        }

        return ctrlOption;
    }
    
    setRequestedDataSource(source) {
        this._requestedDataSource = source;
    }

    setI18nSource(source: { translate: TranslateFunction }) {
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

    addRunAction(uiDef: GridRunButtonProperties) {
        if (this.runActionButton === null) {
            let name = uiDef.name === undefined ? null :  uiDef.name;

            if (uiDef.controlID !== undefined)
                throw 'This control definition has already been assigned a control id. It has already been used by a control';

            uiDef.controlID = this._nextControlID++;

            const ctrl = new GridRunButton(uiDef, null);

            /*if (ctrl.setRequestedDataSource)
                ctrl.setRequestedDataSource(this._requestedDataSource);
        
            if (ctrl.setControlManager)
                ctrl.setControlManager(this);*/
            
            if (uiDef.name !== undefined || ctrl.hasProperty("optionName")) {
                if (ctrl.setOption) {
                    let id = ctrl.getPropertyValue("optionName");
                    let isVirtual = false;
                    if (id === null) {
                        id = name;
                        isVirtual = ctrl.getPropertyValue("isVirtual");
                    }
                    let option: ControlOption<any> = null;
                    if (isVirtual)
                        option = this._getVirtualOption();
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
                resourceId = this.model.actionManager.addResource(name, ctrl);
            }

            ctrl.on('disposing', () => {
                if (this._ctrlListValid === true) {
                    this._ctrlListValid = false;
                    setTimeout(() => { this._validateControlList(); }, 0);
                }
            });


            this._allCtrls.push( { ctrl: ctrl as Control<GridRunButtonProperties>, resourceId: resourceId } );

            this.runActionButton = ctrl;
            this.runActionButton.createItem();
        }
    }

    createControl<P extends CtrlDef>(uiDef: P, parent: any): Control<P> {
        if (uiDef.type === undefined) {
            if (uiDef.controls !== undefined)
                uiDef.type = DefaultControls.LayoutBox;
            else
                throw "Type has not been defined for control '"+ uiDef.name + "'";
        }

        if (IsGridRunButtonProperties(uiDef)) {
            this.addRunAction(uiDef);
            return null;
        }

        let name = uiDef.name === undefined ? null :  uiDef.name;

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

        let ctrl: Control<P> = null;
        if (uiDef.type.create) {
            ctrl = uiDef.type.create(uiDef, parent) as Control<P>;
            if (ctrl === null)
                return null;
        }
        else
            ctrl = new uiDef.type(uiDef, parent) as Control<P>;

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
                let option: ControlOption<any> = null;
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
