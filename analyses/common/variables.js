
"use strict";

var Opt = require('./option');

function Variables(data) {
    this.type = 'Variables';

    this.toString = function(index) {
        return this._value[index].toString();
    };

    this.getVariablesContaining = function(item) {
        var list = [];
        for (var i = 0; i < this._value.length; i++) {
            var variable = this._value[i];
            if (variable.contains(item))
                list.push(variable);
        }
        return list;
    };

    this.removeVariablesContaining = function(item) {
        var list = [];
        var changed = false;
        for (var i = 0; i < this._value.length; i++) {
            var variable = this._value[i];
            if (variable.contains(item) === false)
                list.push(variable);
            else
                changed = true;
        }

        if (changed)
            this.setValue(list, true);

        return changed;
    };

    this.onInitialise(data);
}

Variables.prototype = new Opt({ default: [] });
Variables.prototype.constructor = Variables;

module.exports = Variables;
