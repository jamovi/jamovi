
'use strict';

var _ = require('underscore');
var $ = require('jquery');

function LayoutDef() {

    this.controls = [];
    this.stage = 2; // 0 - release, 1 - development, 2 - proposed
    this.getTitle = function() {
        return this.label ? this.label : "Undefined";
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
