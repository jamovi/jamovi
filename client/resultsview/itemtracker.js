'use strict';

const Item = function(item, update, deactivate) {
    this._static = update === undefined || update === null;

    this._update = update;
    this.item = item;
    this.$el = item;
    if (item.$el !== undefined) {
        this.$el = item.$el;
        this._static = item.update === undefined;
    }

    this.isActive = function() {
        if (this._lastActive !== null)
            return this._lastActive;

        return this._active;
    };

    this.updated = function() {
        return this._updated;
    };

    this.activate = function() {
        this._active = true;
        this._lastActive = null;
    };

    this.isStatic = function() {
        return this._static;
    };

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

    this.begin = function() {
        this._lastActive = this._active;
        this._active = false;
        this._updated = false;
    };

    this.end = function() {
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
    };

};

const ItemTracker = function() {

    this._items = { };

    this.include = function(address, activate, update, deactivate) {

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
    };

    this.begin = function() {
        for (let addr in this._items)
            this._items[addr].begin();
    };

    this.end = function() {
        for (let addr in this._items) {
            let current = this._items[addr];
            if (current.end()) {
                delete this._items[addr];
                current.$el.remove();
            }
        }
    };
};

module.exports = ItemTracker;
