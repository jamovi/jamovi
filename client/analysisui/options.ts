
'use strict';

import { TranslateFunction } from '../common/i18n';
import Opt from './option';
import { EventEmitter } from 'events';

type QueueType = { 
    option: Opt<any>;
    keys: (string|number)[];
    type: 'change' | 'property' | 'insert' | 'remove';
    value: any[];
    length: 1;
}

type QueueStoreType = { 
    option: Opt<any>;
    events: any[];
    properties: QueueType[];
}

class keyedQueue {

    map: { [key: string]: QueueStoreType} = { };
    _hasEvents = false;

    getKeyLevel(keys) {
        if (keys === undefined)
            return 0;

        return keys.length;
    }

    push(key: string, obj: QueueType) {
        this._hasEvents = true;
        let oldData = this.map[key];

        if (oldData === undefined) {
            oldData = { events: [ ], properties: [ ], option: null };
            this.map[key] = oldData;
        }

        oldData.option = obj.option;
        if (obj.type === 'change' && this.getKeyLevel(obj.keys) === 0) {
            oldData.events = [ obj ];
            return;
        }

        if (obj.type === 'property')
            this.processProperty(obj, oldData.properties);
        else
            this.processEvent(obj, oldData.events);
    }

    compareKeys(newKey: (number | string)[], k2: (number | string)[]) {
        if (k2.length > newKey.length || newKey.length === 0)
            return { same: false, sibling: false };

        for (let i = 0; i < newKey.length; i++) {
            if (i === newKey.length - 1) {
                let newKeyi = newKey[i];
                let k2i = k2[i];

                let sameType = typeof(newKeyi) === typeof(k2i);
                if (sameType && newKeyi === k2i)
                    return { same: true, sibling: true, distance: 0 };
                else if (sameType && typeof(newKeyi) === 'number' && typeof(k2i) === 'number')
                    return { same: false, sibling: true, distance: newKeyi - k2i };
                else
                    return { same: false, sibling: true, distance: null };
            }
            else
                return { same: false, sibling: false };
        }
    }

    compareArrays(a1: any[], a2: any[]) {
        if (a1.length !== a2.length)
            return false;

        for (let i = 0; i < a1.length; i++) {
            if (a1[i] !== a2[i])
                return false;
        }

        return true;
    }

    processProperty(obj: QueueType, oldData: QueueType[]) {
        for (let i = 0; i < oldData.length; i++) {
            if (this.compareArrays(obj.keys, oldData[i].keys)) {
                oldData[i] = obj;
                return;
            }
        }

        oldData.push(obj);
    }

    processEvent(obj: QueueType, oldData: QueueType[], startIndex?) {

        if (startIndex === undefined)
            startIndex = oldData.length - 1;

        if (startIndex === -1) {
            oldData.push(obj);
            return;
        }

        let lastItem = oldData[startIndex];
        let compare = this.compareKeys(obj.keys, lastItem.keys);
        let unsafeDirection = -1;
        if (obj.type === 'change')
            unsafeDirection = 1;

        if (lastItem.type === obj.type && compare.sibling && compare.distance !== null && compare.distance <= lastItem.length) {
            if (obj.value)
                lastItem.value[compare.distance] = obj.value[0];

            if (compare.distance === lastItem.length)
                lastItem.length += 1;
        }
        else if (compare.sibling && compare.distance !== null && (unsafeDirection * compare.distance) >= 0)
            oldData.push(obj);
        else
            this.processEvent(obj, oldData, startIndex - 1);
    }

    contains(key: string) {
        return this.map[key] !== undefined;
    }

    hasEvents() {
        return this._hasEvents;
    }
}

// Typing system for the options. Is needed when compiling the analysis. Just leaving here till needed
type TypeMap = {
  String: string;
  Number: number;
  Integer: number;
  Boolean: boolean;
  Variable: string;
  Variables: string[];
  Term: string[];
  NMXList: string[];
  List: string;
  Terms: string[][];
  Output: { value: boolean, vars: string[] };
};

type BaseNode = { type: keyof TypeMap };
type ArrayNode = { type: 'Array'; template: TypeNode };
type GroupNode = { type: 'Group'; element: { name: string } & TypeNode };

type TypeNode = BaseNode | ArrayNode | GroupNode;

export type OptionDef = TypeNode & {
    default?: any;
    name: string;
};

export type InferOptionType<T> =
  T extends { type: 'Array'; template: infer U }
    ? InferOptionType<U>[]
    : T extends { type: 'Group'; element: infer Elements }
      ? Elements extends (infer E)[]
        ? {
            [K in E extends { name: infer N; type: any }
              ? N extends string
                ? N
                : never
              : never]:
              E extends { name: K; type: any }
                ? InferOptionType<E>
                : never
          }
        : never
      : T extends { type: keyof TypeMap }
        ? TypeMap[T['type']]
        : never;

export interface IOptionsEventParams {
    force: boolean;
    silent: boolean;
    data: any;
    externalEvent: boolean;
}

export class Options extends EventEmitter {
    static getDefaultEventParams() : IOptionsEventParams {
        return {
            force: false,
            silent: false,
            data: null,
            externalEvent: false
        };
    }

    _list: Opt<any>[] = [];
    _refList: { [key: string ] : Opt<any> };
    _refListIndex = 0;
    _serverQueuedEvents = new keyedQueue();
    _beginEdit = 0;

    constructor(def : OptionDef[], translator: TranslateFunction) {
        super();

        this._refList = { };
        this._refListIndex = 0;

        this._beginEdit = 0;

        this.initialize(def, translator);
    }

    initialize(def: OptionDef[], translator: TranslateFunction) {
        for (let i = 0; i < def.length; i++) {
            let item = def[i];

            if (item.default === undefined)
                item.default = null;

            this.translateDefault(translator, item);
            
            //type OutputType = InferType<typeof item>;
            //console.log(item.type)
            let option = new Opt<any>(item.default, item);

            this._list.push(option);
        }
    }

    translateDefault(translator: TranslateFunction, item: any, defaultValue?: any): string | null {
        if (defaultValue === undefined) {
            if (item.default) {
                let translated = this.translateDefault(translator, item, item.default);
                if (translated !== null)
                    item.default = translated;
                return;
            }
        }

        if (defaultValue) {
            switch (item.type) {
                case 'String':
                    return translator(defaultValue);
                case 'Group':
                    for (let element of item.elements) {
                        let translated = this.translateDefault(translator, element, defaultValue[element.name]);
                        if (translated !== null)
                            defaultValue[element.name] = translated;
                    }
                    break;
                case 'Array':
                    for (let i = 0; i  < defaultValue.length; i++) {
                        let translated = this.translateDefault(translator, item.template, defaultValue[i]);
                        if (translated !== null)
                            defaultValue[i] = translated;
                    }
                    break;
            }
        }

        return null;
    }

    public runInEditScope(fn: () => void) {
        this.beginEdit();
        try {
            fn();
        } finally {
            this.endEdit();
        }
    }

    beginEdit() {
        this._beginEdit += 1;
    }

    endEdit() {
        this._beginEdit -= 1;
        if (this._beginEdit === 0) {
            this.fireQueuedEvents();
        }
    }

    getOption(name: string | number) {

        let list = this._list;

        if ( ! list)
            return null;

        if (typeof name === 'number' && isFinite(name))
            return list[name];

        let option = this._refList[name];

        if (option === undefined) {
            option = null;
            let i = this._refListIndex;
            for (; i < list.length; i++) {
                let optObj = list[i];
                this._refList[optObj.name] = optObj;
                if (optObj.name === name) {
                    option = optObj;
                    i += 1;
                    break;
                }
            }

            this._refListIndex = i;
        }

        return option;
    }

    setOptionValue(name: string | Opt<any>, value: any, keys: (string | number)[], eventParams? : IOptionsEventParams) {

        if (eventParams === undefined) {
            if (keys === undefined) {
                keys = [];
                eventParams = Options.getDefaultEventParams();
            }
            else if (Array.isArray(keys) === false) {
                eventParams = keys;
                keys = [];
            }
            else
                eventParams = Options.getDefaultEventParams();
        }

        let option: Opt<any> = null;
        if (name instanceof Opt)
            option = name;
        else
            option = this.getOption(name);

        if (option === null || !option.setValue)
            return false;

        let eOpt = Opt.getDefaultEventParams();
        eOpt.force = eventParams.force;
        eOpt.externalEvent = eventParams.externalEvent;

        if (option.setValue(value, keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, value, keys, 'change');

        return true;
    }

    setPropertyValue(name: string | Opt<any>, propertyName: string, value, key, fragmentName) {
        if (propertyName === 'value' && ! fragmentName) {
            this.setOptionValue(name, value, key);
            return;
        }

        let option: Opt<any> = null;
        if (name instanceof Opt)
            option = name;
        else
            option = this.getOption(name);

        key.push(propertyName);

        option.setProperty(value, key);

        this.onValueChanged(option, value, key, 'property');
    }

    insertOptionValue(name: string | Opt<any>, value: any, keys: (string|number)[], eventParams?: IOptionsEventParams) {

        if (eventParams === undefined)
            eventParams = Options.getDefaultEventParams();

        let option: Opt<any> = null;
        if (name instanceof Opt)
            option = name;
        else
            option = this.getOption(name);

        let eOpt = Opt.getDefaultEventParams('inserted');
        eOpt.force = eventParams.force;

        if (option.insertValueAt(value, keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, value, keys, 'insert');
    }

    removeOptionValue(name: string | Opt<any>, keys: (string | number)[], eventParams?: IOptionsEventParams) {

        if (eventParams === undefined)
            eventParams = Options.getDefaultEventParams();

        let option: Opt<any> = null;
        if (name instanceof Opt)
            option = name;
        else
            option = this.getOption(name);

        let eOpt = Opt.getDefaultEventParams('removed');
        eOpt.force = eventParams.force;

        if (option.removeAt(keys, eOpt) && eventParams.silent === false)
            this.onValueChanged(option, null, keys, 'remove');
    }

    onValueChanged(option, value, keys, type) {

        this._serverQueuedEvents.push(option.name, { option: option, keys: keys, type: type, value: [value], length: 1 });

        if (this._beginEdit === 0)
            this.fireQueuedEvents();
    }

    fireQueuedEvents() {

        if (this._serverQueuedEvents.hasEvents()) {
            this.emit('options.valuesForServer', this._serverQueuedEvents);
            this._serverQueuedEvents = new keyedQueue(); //a new queue is made so that the old queue can be sent without being modified.
        }
    }

    
}

export default Options;
