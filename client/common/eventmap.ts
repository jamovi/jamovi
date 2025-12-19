'use strict';

import { EventEmitter } from 'events';

interface IEventGroupInfo {
    eventNames: string[], 
    triggered: boolean
}

export class ContextableEventEmittier extends EventEmitter {
    private _listeners: Map<string | symbol, any>;

    private _groupListners: Map<string, IEventGroupInfo>;
    private _emit:(eventName: string | symbol, ...args: any[]) => boolean;
    private _compiling = false;
    private _compiledList = new Set<string>();
    private _isClosed = false;
    private _eventQueue: { eventName: string | symbol, args: any[]}[] = [];

    constructor() {
        super();
        this._listeners = new Map<string | symbol, any>();
        this._groupListners = new Map<string, IEventGroupInfo>();

        this._emit = this.emit;
        this.emit = (eventName: string | symbol, ...args: any[]) => {
            throw 'Use trigger(...) instead!';
        };

        this.setMaxListeners(20);
    }

    public override on(eventName: string | symbol, callback: (...args: any[]) => void, context?: any): this {

        const bound = context ? callback.bind(context) : callback;

        // group listeners
        if (typeof eventName === 'string') {
            let eventNames = eventName.split(' ');
            if (eventNames.length > 1 && this._groupListners.has(eventName) === false)
                this._groupListners.set(eventName, { eventNames, triggered: false });
        }

        if ( ! this._listeners.has(eventName)) 
          this._listeners.set(eventName, []);

        this._listeners.get(eventName)!.push({ original: callback, bound, context });

        return super.on(eventName, bound);
    }

    public override removeAllListeners(eventName? : string | symbol): this {
        return this.off(eventName);
    }

    public override off(eventName?: string | symbol, callback?: (...args: any[]) => void, context?: any): this {
        if (eventName === undefined && callback === undefined && context === undefined) {
            this._listeners.clear();
            this._groupListners.clear();
            return super.removeAllListeners();
        }
        else if (callback === undefined && context === undefined) {
            this._listeners.delete(eventName);
            if (typeof eventName === 'string') {
                for (const groupInfo of this._groupListners.values()) {
                    groupInfo.eventNames = groupInfo.eventNames.filter(item => item !== eventName);
                }
            }
            return super.removeAllListeners(eventName);
        }

        const records = this._listeners.get(eventName);
        if ( ! records) 
            return this;

        const index = records.findIndex(
            record => record.original === callback && record.context === context
        );

        if (index !== -1) {
            const [record] = records.splice(index, 1);
            return super.off(eventName, record.bound);
        }

        return this;
    }

    public override once(eventName: string | symbol, callback: (...args: any[]) => void, context?: any) : this {
        let self = this;
        const bound : (...args: any[]) => void = (...args: any[]) => {
            callback.call(context ? context : this, ...args);
            self.off(eventName, callback, context);
        };

        if ( ! this._listeners.has(eventName)) 
          this._listeners.set(eventName, []);

        this._listeners.get(eventName)!.push({ original: callback, bound, context });

        return super.on(eventName, bound);
    }

    public trigger(eventName: string | symbol, ...args: any[]) {
        if (this._compiling) {
            if (typeof eventName === 'string')
                this._compiledList.add(eventName);
            
            this._eventQueue.push({ eventName, args })
        }
        else {
            if (typeof eventName === 'string') {
                this._resetTriggeredGroups();
                this._triggerAnyGroups(eventName, ...args);
            }

            this._emit(eventName, ...args);
        }
    }

    private _triggerAnyGroups(trigger: string, ...args: any[]) {
        for (const [eventName, groupInfo] of this._groupListners) {
            if ( ! groupInfo.triggered && groupInfo.eventNames.includes(trigger)) {
                groupInfo.triggered = true;
                this._emit(eventName, args);
            }
        }
    }

    private _resetTriggeredGroups() {
        for (const groupInfo of this._groupListners.values())
            groupInfo.triggered = false;
    }

    protected beginEventCompiling() {
        if (this._compiling)
            throw "Can compile more than one event at a time";
        this._compiling = true;
    }

    protected endEventCompiling(event) {
        if (this._compiling) {
            this._compiling = false;
            if (this._compiledList.size > 0) {
                if (this._groupListners && this._groupListners.size > 0) {
                    this._resetTriggeredGroups();
                    for (const trigger of this._compiledList)
                        this._triggerAnyGroups(trigger, event);
                }

                this._compiledList.clear();
            }

            for (let queuedEvent of this._eventQueue)
                this._emit(queuedEvent.eventName, ...queuedEvent.args);

            this._eventQueue = [];
        }
    }

    onClose?(): void;

    	/** Removes DOM tree elements and any listeners from or too the view object */
    public close() {
        if ( ! this._isClosed) {
            if (this.onClose)
                this.onClose();

            //this.remove();
            this.off();
            this._isClosed = true;
        }
    }
}

export abstract class EventDistributor extends HTMLElement {
    eventInfo: {[key:string]:{callback: (...args: any[]) => any, selector:string}[]} = { };

    constructor() {
        super();
    }

    public setEventMap(eventMap: {[eventSource: string]: (...args: any[]) => void}) {
        if (eventMap) {
            for (let eventSource in eventMap) {
                let callback = eventMap[eventSource];
                if (callback === undefined)
                    continue;

                let split = eventSource.split(' ');
                let eventName = split[0];
                let selector = '';
                if (split.length > 1)
                    selector = split.slice(1).join(' ');

                let callbacks = this.eventInfo[eventName];
                if ( ! callbacks) {
                    callbacks = [];
                    this.eventInfo[eventName] = callbacks;
                    this.addEventListener(eventName, (event) => {
                        let target = event.target as HTMLElement;
                        if (target) {
                            for (let info of callbacks) {
                                if ( info.selector === '' || this.closestUntil(target, info.selector, this) !== null)
                                    info.callback.call(this, event);
                            }
                        }
                    });
                }

                callbacks.push({ callback, selector });
            }
        }
    }

    private closestUntil(el: HTMLElement, selector: string, stopAt: HTMLElement) {
        while (el && el !== stopAt) {
            if (el.matches(selector)) 
                return el;
            el = el.parentElement;
        }
        return null;
    }
}

export class EventMap<T> extends ContextableEventEmittier {
    
    public attributes: Partial<T>;
    public previousAttributes: Partial<T> = { };

    constructor(attributes: Partial<T>) {
        super();
        this.attributes = attributes;
    }

    public get<K extends keyof T>(name: K) {
        return this.attributes[name];
    }

    public previous<K extends keyof T>(name: K) {
        return this.previousAttributes[name];
    }

    public set<K extends keyof T>(name: K, value: T[K], options?: { silent: boolean }): void;
    public set(attributes: Partial<T>, options?: { silent: boolean }): void;
    public set(attributes:any, value?: any, options?: { silent: boolean }): void {
        let hasChanged = false;
        let changed = { };
        if (typeof attributes === 'string') {
            if (this._set(attributes, value)) {
                changed[attributes] = value;
                hasChanged = true;
            }
        }
        else {
            if (value !== undefined)
                options = value;

            for (let name in attributes) {
                let newValue = attributes[name];
                let oldValue = this.attributes[name];
                if (oldValue !== newValue) {
                    this.previousAttributes[name] = oldValue;
                    this.attributes[name] = newValue;
                    changed[name] = newValue;
                    hasChanged = true;
                }
            }
        }

        if (hasChanged) {
            if (options === undefined || ! options.silent) {
                this.beginEventCompiling();
                this.trigger(`change`, { changed });
                for (let name in changed)
                    this.trigger(`change:${name}`, { changed });
                this.endEventCompiling({ changed });
            }
        }
    }

    private _set(name, value) {
        let oldValue = this.attributes[name];
        if (oldValue !== value) {
            this.previousAttributes[name] = oldValue;
            this.attributes[name] = value;
            return true;
        }
        return false;
    }
}