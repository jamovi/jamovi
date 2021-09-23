
'use strict';

const Format = function(def) {

    this.isEmpty = function(raw) {
        return raw === null;
    };

    this.getFormat = function(key) {
        if (key === undefined || key.length === 0)
            return this;

        if (this.children === undefined)
            return null;

        let format = this.children[key[0]];
        if (format === undefined)
            return null;

        if (key.length === 1)
            return format;

        return format.getFormat(key.slice(1));
    };

    this.createItem = function() {
        let item = null;
        if (this.children) {
            item = { };
            for (let name in this.children) {
                let format = this.children[name];
                item[name] = format.create();
            }
        }
        return item;
    };

    this.allFormats = function(equalTo) {
        let childrenList = [];
        this._allFormats(childrenList, this, [], equalTo);
        return childrenList;
    };

    this._allFormats = function(list, format, valueKey, equalTo) {
        if (equalTo === undefined || equalTo.name === format.name)
            list.push({ format: format, key: valueKey });

        if (format.children) {
            for (let subItem in format.children) {
                let subkey = valueKey.slice(0);
                subkey.push(subItem);
                let subFormat = format.children[subItem];
                this._allFormats(list, subFormat, subkey, equalTo);
            }
        }
    };


    Object.assign(this, def);
};


module.exports = Format;
