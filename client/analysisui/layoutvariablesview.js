
'use strict';

var LayoutSupplierView = require('./layoutsupplierview');
var Overridable = require('./overridable');
var FormatDef = require('./formatdef');
var EnumArrayPropertyFilter = require('./enumarraypropertyfilter');

var LayoutVariablesView = function(params) {

    LayoutSupplierView.extendTo(this, params);
    Overridable.extendTo(this);

    this.$el.addClass("silky-options-variable-supplier-group");

    this.registerSimpleProperty("suggested", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));
    this.registerSimpleProperty("permitted", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));

    this._override("onContainerRendering", function(baseFunction, context) {

        this.resources = context.resources;

        baseFunction.call(this, context);

        this.populateItemList();
    });

    this.updateContext = function(context) {
        this.resources = context.resources;
        this.populateItemList();
    };

    this.populateItemList = function() {

        var suggested = this.getPropertyValue("suggested");
        var permitted = this.getPropertyValue("permitted");

        var suggestedCount = 0;
        var permittedCount = 0;

        var items = [];
        var columns = this.resources.columns;
        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];
            var item = { value: new FormatDef.constructor(column.name, FormatDef.variable), properties: { type: column.measureType, permitted: true } };

            if (suggested && this._contains(column.measureType, suggested)) {
                items.splice(suggestedCount, 0, item);
                suggestedCount += 1;
            }
            else if (permitted && this._contains(column.measureType, permitted)) {
                items.splice(suggestedCount + permittedCount, 0, item);
                permittedCount += 1;
            }
            else {
                items.push(item);
                item.properties.permitted = permitted.length === 0;
            }
        }
        this.setList(items);
    };

    this._contains = function(value, list) {
        for (let i = 0; i < list.length; i++) {
            if (value === list[i])
                return true;
        }
        return false;
    };
};

module.exports = LayoutVariablesView;
