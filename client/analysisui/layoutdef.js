
'use strict';

var _ = require('underscore');
var $ = require('jquery');

function LayoutDef() {

    this.getTitle = function() {
        return this.title ? this.title : "Undefined";
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

    this.layout = [];
}

LayoutDef.asBase = function(target) {
    LayoutDef.call(target);
};

LayoutDef.extend = function(params) {
    return function() {
        LayoutDef.asBase(this);
        _.extend(this, params);
    };
};

module.exports = LayoutDef;
