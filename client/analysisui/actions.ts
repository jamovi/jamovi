
'use strict';

import { DataType, MeasureType } from '../main/dataset';
import { IItem } from './dragndrop';
import Format from './format';
import { FormatDef, FormattedValue, VariableFormat } from './formatdef';
import { Control, CtrlDef } from './optionsview';
import GetRequestDataSupport from './requestdatasupport';
import { EventEmitter } from 'events';

export const utils = {
    checkPairsValue: (ctrl, variables) => {
        let changed = false;
        let pairs = utils.clone(ctrl.value());
        if (pairs !== null && pairs.length > 0) {
            for (let i = 0; i < pairs.length; i++) {
                let pair = pairs[i];
                let found = 0;
                for (let j = 0; j < variables.length; j++) {
                    let variable = variables[j];
                    if (pair.i1 === variable)
                        found += 1;
                    if (pair.i2 === variable)
                        found += 2;
                    if (found === 3)
                        break;
                }
                if (found !== 3) {
                    changed = true;
                    if (found === 0) {
                        pairs.splice(i, 1);
                        i -= 1;
                    }
                    else if (found === 1)
                        pair.i2 = null;
                    else if (found === 2)
                        pair.i1 = null;
                }
            }
            if (changed)
                ctrl.setValue(pairs);
        }
    },

    checkValue: (ctrl, valuesAtlevel, validValues, format) => {
        if (valuesAtlevel === true)
            valuesAtlevel = 1;
        else if (valuesAtlevel === false)
            valuesAtlevel = 0;

        let value = utils.clone(ctrl.value());
        if (valuesAtlevel > 0 && value === null)
            value = [];

        let changed = false;
        if (valuesAtlevel > 0) {
            let removeFromList = (list) => {
                if ( ! list)
                    return false;

                let removed = false;
                for (let i = 0; i < list.length; i++) {
                    if (utils.listContains(validValues, list[i], format) === false) {
                        list.splice(i, 1);
                        i -= 1;
                        removed = true;
                    }
                }
                return removed;
            };

            let getValue = (data, indices) => {
                let value = data;
                for (let x = 0; x < indices.length; x++) {
                    if (indices[x] >= value.length) {
                        indices[x] = 0;
                        if (x > 0)
                            indices[x-1] += 1;
                        else
                            return;

                        return getValue(data, indices);
                    }
                    value = value[indices[x]];
                    if (x < indices.length - 1 && Array.isArray(value) === false) {
                        if (value === null || value === undefined) {
                            value[indices[x]] = [];
                            value = value[indices[x]];
                        }
                        else
                            break;
                    }
                }

                return value;
            };

            let indices = [];
            for (let x = 0; x < valuesAtlevel - 1; x++)
                indices[x] = 0;

            let list = getValue(value, indices);
            while (list !== undefined) {
                if (removeFromList(list))
                    changed = true;

                if (indices.length === 0)
                    break;
                else if (indices.length > 0) {
                    indices[indices.length - 1] += 1;
                    list = getValue(value, indices);
                }
            }
        }
        else if (utils.listContains(validValues, value, format) === false) {
            value = null;
            changed = true;
        }

        if (changed)
            ctrl.setValue(value);
    },

    clone: (obj: any, ifNull?: any): any => {
        let clone = JSON.parse(JSON.stringify(obj));
        if (ifNull !== undefined && clone === null)
            clone = ifNull;

        return clone;
    },

    sortArraysByLength: (arrays: any[], itemPropertyName?: string): boolean => {
        let changed = false;
        for (let i = 0; i < arrays.length - 1; i++) {
            let item1 = itemPropertyName === undefined ? arrays[i] : arrays[i][itemPropertyName];
            let item2 = itemPropertyName === undefined ? arrays[i+1] : arrays[i+1][itemPropertyName];

            let l1 = item1.length;
            let l2 = item2.length;

            if (arrays.length > i + 1 && (l1 > l2)) {
                changed = true;
                let temp = arrays[i+1];
                arrays[i+1] = arrays[i];
                arrays[i] = temp;
                if (i > 0)
                    i = i - 2;
            }
        }

        return changed;
    },

    listContains: <T>(list, value, format?: Format<T>, itemPropertyName?: string): boolean => {
        for (let i = 0; i < list.length; i++) {
            let item = itemPropertyName === undefined ? list[i] : list[i][itemPropertyName];
            if (format === undefined) {
                if (item === value)
                    return true;
            }
            else if (format.isEqual(item, value))
                return true;
        }

        return false;
    },

    findDifferences: <T>(from: T[], to: T[], format?: Format<T>, itemPropertyName?: string): { removed: T[], added: T[] } => {
        let j = 0;

        let obj: { removed: T[], added: T[] } = { removed: [], added: [] };

        if ((from === null || from === undefined) && (to === null || to === undefined))
            return obj;
        else if (from === null || from === undefined) {
            for (j = 0; j < to.length; j++)
                obj.added.push(to[j]);
        }
        else if (to === null || to === undefined) {
            for (j = 0; j < from.length; j++)
                obj.removed.push(from[j]);
        }
        else {
            for (j = 0; j < from.length; j++) {
                let fromItem = itemPropertyName === undefined ? from[j] : from[j][itemPropertyName];
                if (utils.listContains(to, fromItem, format, itemPropertyName) === false)
                    obj.removed.push(from[j]);
            }

            for (j = 0; j < to.length; j++) {
                let toItem = itemPropertyName === undefined ? to[j] : to[j][itemPropertyName];
                if (utils.listContains(from, toItem, format, itemPropertyName) === false)
                    obj.added.push(to[j]);
            }
        }

        return obj;
    },

    getCombinations: <T>(values: T[], baseList?: T[][]): T[][] => {
        let list: T[][] = [];
        if (baseList !== undefined && Array.isArray(baseList))
            list = baseList;

        for (let i = 0; i < values.length; i++) {
            let listLength = list.length;
            let value = values[i];

            for (let j = 0; j < listLength; j++) {
                let newValue = utils.clone(list[j]);
                newValue.push(value);
                list.push(newValue);
            }
            list.push([value]);
        }

        for (let i = 0; i < list.length; i++)
            list[i] = utils.flattenList(list[i]);

        return list;
    },

    flattenList: <T>(list: T[]): T[] => {
        let flatList: T[] = [];
        for (let value of list) {
            if (Array.isArray(value))
                flatList = flatList.concat(utils.flattenList(value));
            else
                flatList.push(value);
        }
        return flatList;
    },

    getItemCombinations: (items: IItem<string>[]) => {
        let values = utils.itemsToValues(items);
        let combinations = utils.getCombinations(values);
        return utils.valuesToItems<(string | string[])[]>(combinations, FormatDef.term);
    },

    valuesToItems: <T>(values: T[], format: Format<T>): any[] => {
        if (values === null)
            return [];

        let list = [];
        for (let i = 0; i < values.length; i++) {
            let value = values[i];
            if (format instanceof VariableFormat && Array.isArray(value))
                list.push({ value: new FormattedValue<string>(value[0], format), properties: { power: value.length } });
            else
                list.push({ value: new FormattedValue<T>(value, format) });
        }
        return list;
    },

    itemsToValues: <T>(items: IItem<T>[]): (T | T[])[] => {
        let list: (T | T[])[] = [];
        for (let i = 0; i < items.length; i++) {
            if (items[i].properties.power > 1) {
                let g: T[] = [];
                for (let h = 0; h < items[i].properties.power; h++)
                    g.push(items[i].value.raw);

                list.push(g);
            }
            else
                list.push(items[i].value.raw);
        }
        return list;
    }
};

export type CustomColumn = { name: string, measureType: MeasureType, dataType: DataType, levels: any[] }

export type ViewEvent = { 
    execute: (...args: any[]) => void;
    onChange?: string | string[];
    onEvent?: string | string[];
};

export type ViewResources = { [id: string]: Control<CtrlDef> };

class View extends EventEmitter {

    // this is to maintain backwards compatibility for v2.0 and v3.0 modules
    public static extend(params) {
        return function() {
            let view = this as View;
            let errors = [];
            if (view.handlers === undefined) { // version 2.0 modules need the utils as part of this object. This is here for backwards compatability
                Object.assign(view, utils); 
                return errors;
            }

            // this.handlers is created in the compiler.
            for (let handle in view.handlers) {
                if (view[handle] !== undefined)
                    errors.push('The method name "' + handle + '" cannot be used as it conflicts with a method that already exists in the events base class of this analyses.');
                else
                    view[handle] = view.handlers[handle];
            }

            view.errors = errors;

            Object.assign(view, params);
            if (view.events !== undefined)
                view.events = view._baseEvents.concat(view.events);
            else
                view.events = view._baseEvents;
        };
    }

    workspace: { [id: string]: any} = { };
    flags: { loaded: boolean, updating: boolean } = { loaded: true, updating: false };
    private customVariables: CustomColumn[] = [];
    handlers: { [name: string] : (...args: any[]) => void };
    _id: number;
    errors: string[] = [];

    // for backwards compatibility with v2.0
    events?: ViewEvent[];

    _baseEvents: ViewEvent[] = [
        {
            onEvent: 'view.remote-data-changed', execute: (ui, data) => {
                if (this.remoteDataChanged) {
                    data.sender = ui.view;
                    data.eventName = 'remoteDataChanged';
                    this.remoteDataChanged.call(this, ui, data);
                }
            }
        },
        {
            onEvent: 'view.loaded', execute: (ui) => {
                this.flags.loaded = true;
                if (this.loaded)
                    this.loaded.call(this, ui, { sender: ui.view, eventName: 'loaded' });
            }
        },
        {
            onEvent: 'view.data-initializing', execute: (ui, event) => {
                if (event.id !== this._id) {
                    this.workspace = {};
                    if (this)
                        this.workspace = this.workspace;
                }
                this.flags.updating = true;
            }
        },
        {
            onEvent: 'view.ready', execute: (ui, event) => {
                this.flags.updating = false;
                if (this.update && event.id !== this._id) {
                    event.sender = ui.view;
                    event.eventName = 'updated';
                    this.update.call(this, ui, event);
                    this._id = event.id;
                }
            }
        }
    ];

    constructor(params?) {
        super();

        // v4.0
        if (params)
            Object.assign(this, params);

        GetRequestDataSupport(this);
    }

    remoteDataChanged?(ui, data): void;
    loaded?(ui, event): void;
    update?(ui, event): void;
    creating(ui, event): void {
        this.registerListeners(ui);
    }

    protected registerListeners(ui): void {

    }

    protected setCustomVariables(variables: CustomColumn[]): void {
        this.customVariables = variables;
        let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
        this.emit('customVariablesChanged', event);
    }

    protected setCustomVariable(name: string, measureType: MeasureType, dataType: DataType, levels: any[]): void {
        let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: false } };

        let found = false;
        let changed = false;
        for (let i = 0; i < this.customVariables.length; i++) {
            if (this.customVariables[i].name === name) {

                if (measureType !== this.customVariables[i].measureType) {
                    changed = true;
                    event.dataInfo.measureTypeChanged = true;
                    this.customVariables[i].measureType = measureType;
                }

                if (dataType !== this.customVariables[i].dataType) {
                    changed = true;
                    event.dataInfo.dataTypeChanged = true;
                    this.customVariables[i].dataType = dataType;
                }

                if (levels !== this.customVariables[i].levels) {
                    if (levels === undefined || this.customVariables[i].levels === undefined || levels.length !== this.customVariables[i].levels.length) {
                        changed = true;
                        event.dataInfo.levelsChanged = true;
                        this.customVariables[i].levels = levels;
                    }
                    else {
                        for (let j = 0; j < levels.length; j++) {
                            if (levels[j] !== this.customVariables[i].levels[j]) {
                                changed = true;
                                event.dataInfo.levelsChanged = true;
                                this.customVariables[i].levels = levels;
                                break;
                            }
                        }
                    }
                }
                found = true;
                break;
            }
        }

        if (found === false) {
            changed = true;
            event.dataInfo.countChanged = true;
            this.customVariables.push( { name: name, measureType: measureType, dataType: dataType, levels: levels });
        }

        if (changed)
            this.emit('customVariablesChanged', event);
    }

    protected removeCustomVariable(name: string): void {
        let found = false;
        for (let i = 0; i < this.customVariables.length; i++) {
            if (this.customVariables[i].name === name) {
                this.customVariables.splice(i, 1);
                found = true;
                break;
            }
        }

        if (found) {
            let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
            this.emit('customVariablesChanged', event);
        }
    }

    protected clearCustomVariables() {
        if (this.customVariables.length > 0) {
            let event = { dataType: 'columns' , dataInfo: { measureTypeChanged: false, dataTypeChanged: false, nameChanged: false, levelsChanged: false, countChanged: true } };
            this.customVariables = [];
            this.emit('customVariablesChanged', event);
        }
    }

    protected findChanges<T>(id: string, current: T | T[], updateWS: boolean, format: Format<T>, itemProperty?: string): { oldValue: T | T[], newValue: T | T[], removed: any[], added: any[], hasChanged: boolean } {
        let oldValue = this.workspace[id] as T | T[];

        let diff = null;

        if (Array.isArray(current) || Array.isArray(oldValue)) {
            diff = { removed: [], added: [], hasChanged: false };
            if (oldValue !== undefined)
                diff = utils.findDifferences(oldValue, current, format, itemProperty);
            diff.hasChanged = diff.removed.length > 0 || diff.added.length;
        }
        else {
            let hasChanged = oldValue === undefined;
            if (current === undefined)
                hasChanged = true;
            else if (oldValue !== undefined) {
                if (format === undefined)
                    hasChanged = oldValue !== current;
                else
                    hasChanged = format.isEqual(oldValue, current) === false;
            }

            diff = { oldValue: oldValue, newValue: current, hasChanged: hasChanged, removed: [], added: [] };
        }

        if (updateWS)
            this.workspace[id] = current;

        return diff;
    }

    protected isReady() {
        return this.flags.updating === false && this.flags.loaded;
    }

    protected initializeValue(option, defaultValue) {
        let value = option.value();
        if (value === null) {
            option.setValue(defaultValue);
            return true;
        }

        return false;
    }

    // DEPRECATED! should use the 'clone' method instead.
    cloneArray(array, ifNull) {
        return utils.clone(array, ifNull);
    }
}

export default View;
