
'use strict';

var LayoutSupplierView = require('./layoutsupplierview');
var FormatDef = require('./formatdef');
var EnumArrayPropertyFilter = require('./enumarraypropertyfilter');
const RequestDataSupport = require('./requestdatasupport');

var LayoutVariablesView = function(params) {

    LayoutSupplierView.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.$el.addClass("silky-options-variable-supplier-group");

    this.registerSimpleProperty("suggested", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));
    this.registerSimpleProperty("permitted", [], new EnumArrayPropertyFilter(["continuous", "ordinal", "nominal", "nominaltext"]));

    this._override("onContainerRendering", function(baseFunction, context) {

        //this.resources = context.resources;

        baseFunction.call(this, context);

        let promise = this.requestData("columns", null);
        promise.then(columnInfo => {
            this.resources = columnInfo;
            this.populateItemList();
        });

        //this.populateItemList();
    });

    this._override("onDataChanged", (baseFunction, data) => {
        if (data.dataType !== "columns")
            return;

        if (data.dataInfo.nameChanged || data.dataInfo.measureTypeChanged) {
            let promise = this.requestData("columns", null);
            promise.then(columnInfo => {
                this.resources = columnInfo;
                this.populateItemList();
            });
        }
    });

    this.requestMeasureType = function(columnId, item) {
        let promise = this.requestData("column", { columnId: columnId, properties: [ "measureType", "id" ] });
        promise.then(rData => {
            if (rData.measureType === undefined)
                rData.measureType = "none";

            item.properties.type = rData.measureType;
            item.properties.columnId = rData.id;
          });
        return promise;
    };

    this._waitingFor = 0;

    this.populateItemList = function() {

        var suggested = this.getPropertyValue("suggested");
        var permitted = this.getPropertyValue("permitted");

        var suggestedCount = 0;
        var permittedCount = 0;

        var items = [];
        var columns = this.resources.columns;
        var promises = [];
        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];
            var item = { value: new FormatDef.constructor(column.name, FormatDef.variable), properties: {  id: column.id, permitted: true } };

            promises.push(this.requestMeasureType(column.id, item));

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

        Promise.all(promises).then(() => {
            this.setList(items);
        });
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
