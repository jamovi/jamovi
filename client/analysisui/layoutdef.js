
'use strict';

var _ = require('underscore');
var $ = require('jquery');

function LayoutDef() {

    this.items = [];

    this.getTitle = function() {
        return this.label ? this.label : "Undefined";
    };

    this.getGroupText = function(item) {

        var value = item.label;
        if (_.isUndefined(value) === false) {
            if ($.isFunction(value))
                return value.call(this);
            else
                return value;
        }
        return null;
    };
}

LayoutDef.extendTo = function(target) {
    LayoutDef.call(target);
};

LayoutDef.extend = function(params) {
    return function() {
        LayoutDef.extendTo(this);
        _.extend(this, params);
    };
};

module.exports = LayoutDef;
