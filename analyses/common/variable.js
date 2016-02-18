
'use strict';

var _ = require('underscore');

var Variable = function(items, joiner) {

    if (Array.isArray(items) === false)
        this.items = [ items ];
    else
        this.items = items;

    if (this.items.length > 1 && _.isUndefined(joiner))
        throw "must have a valid joiner for variable with multiple items.";

    this.joiner = joiner;

    this.contains = function(item) {
        for (var i = 0; i < this.items.length; i++) {
            if (item === this.items[i])
                return true;
        }
        return false;
    };

    this.toString = function() {
        var s;
        for (var i = 0; i < this.items.length; i++) {
            var item = this.items[i];
            if (i === 0)
                s = item;
            else if (_.isFunction(this.joiner))
                s += this.joiner(item, i);
            else if (this.joiner)
                s += this.joiner + item;
            else
                s += ' ' + item;
        }
    };
};
