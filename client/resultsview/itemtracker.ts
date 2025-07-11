'use strict';

class Item {  
    _static: boolean;
    $el: any;
    item: any;
    _updated: boolean;

    constructor(item, update, deactivate) {
        this._static = update === undefined || update === null;

        this._update = update;
        this.item = item;
        this.$el = item;
        if (item.$el !== undefined) {
            this.$el = item.$el;
            this._static = item.update === undefined;
        }

        this.activate();
        this._updated = true;

        if (this._static) {
            this.update = function() {
                return true;
            };
        }
        else {
            this.update = function(data) {
                if ((this._update && this._update(this.$el, data)) ||
                    (this.item.update && this.item.update(data))) {

                    this.activate();
                    this._updated = true;

                    return true;
                }
                this._lastActive = null;
                return false;
            };
        }

        if (deactivate !== undefined)
            this.deactivate = deactivate;
        else if (this.item.deactivate)
            this.deactivate = this.item.deactivate.bind(this.item);
    }

    update?(data): boolean;

    isActive() {
        if (this._lastActive !== null)
            return this._lastActive;

        return this._active;
    }

    updated() {
        return this._updated;
    }

    activate() {
        this._active = true;
        this._lastActive = null;
    }

    isStatic() {
        return this._static;
    }

    begin() {
        this._lastActive = this._active;
        this._active = false;
        this._updated = false;
    }

    end() {
        this._lastActive = null;
        if (this._active === false) {
            if (this.deactivate) {
                let removeItem = this.deactivate();
                if ( ! removeItem)
                    return false;
            }
            return true;
        }
        return false;
    }
}

export class ItemTracker {
    _items: { [addr: string]: Item} = { };
    constructor() {
    }

    include(address: string, activate, update, deactivate): Item {

        let current = this._items[address];
        if ( ! current) {
            let item = activate();
            if ( ! item)
                return null;

            current = new Item(item, update, deactivate);

            this._items[address] = current;
        }
        else if (current.isActive() === false) {
            if (activate(current.item))
                current.activate();
            else
                return null;
        }
        else if (current.isStatic())
            current.activate();

        return current;
    }

    begin(): void {
        for (let addr in this._items)
            this._items[addr].begin();
    }

    end(): void {
        for (let addr in this._items) {
            let current = this._items[addr];
            if (current.end()) {
                delete this._items[addr];
                current.$el.remove();
            }
        }
    }
}

export default ItemTracker;
