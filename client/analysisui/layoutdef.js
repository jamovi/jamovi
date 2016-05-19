
'use strict';

var _ = require('underscore');
var $ = require('jquery');
//var FormatDef = require('./formatdef');

function LayoutDef() {

    //this._typedef = new FormatDef();

    this.getTitle = function() {
        return this.title ? this.title : "Undefined";
    };

    this.getOptionText = function(id) {
        if (this.optionText) {
            var value = this.optionText[id];
            if (_.isUndefined(value) === false) {
                if ($.isFunction(value))
                    return value.call(this);
                else
                    return value;
            }
        }
        return id;
    };

    this.getGroupText = function(id) {
        if (this.groupText) {
            var value = this.groupText[id];
            if (_.isUndefined(value) === false) {
                if ($.isFunction(value))
                    return value.call(this);
                else
                    return value;
            }
        }
        return null;
    };

    this.getOptionSuffix = function(id) {
        if (this.optionSuffix) {
            var value = this.optionSuffix[id];
            if (_.isUndefined(value) === false) {
                if ($.isFunction(value))
                    return value.call(this);
                else
                    return value;
            }
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
