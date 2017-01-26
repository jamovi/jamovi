'use strict';

var $ = require('jquery');
var ListItemControl = require('./listitemcontrol');
var FormatDef = require('./formatdef');
const RequestDataSupport = require('./requestdatasupport');


var ListItemVariableLabel = function(params) {

    ListItemControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.registerSimpleProperty("format", FormatDef.variable);

    this._override("onDataChanged", (baseFunction, data) => {
        if (baseFunction !== null)
            baseFunction.call(this, data);

        if (data.dataType !== "columns")
            return;

        if (data.dataInfo.measureTypeChanged)
            this.render();
    });

    this.onUpdateView = function(data, format, properties) {

        let promise = this.requestData("column", { columnName: data, properties: [ "measureType" ] });
        promise.then(rData => {
            let measureType = rData.measureType;
            if (measureType === undefined)
                measureType = "none";
            var imageClasses = 'silky-variable-type-img';
            if (measureType !== null && measureType !== undefined)
                imageClasses = imageClasses + ' silky-variable-type-' + measureType;
            else
                imageClasses = imageClasses + ' silky-variable-type-none';

            this.$el.find(".silky-variable-type-img").removeClass().addClass(imageClasses);
            var $label = this.$el.find(".silky-list-item-value");
            $label.empty();
            if (data !== null)
                $label.append(format.toString(data));
          });
          return promise;
    };

    this.onRender = function(data, format, properties) {
        let promise = this.requestData("column", { columnName: data, properties: [ "measureType" ] });
        promise.then(rData => {
            let measureType = rData.measureType;
            if (measureType === undefined)
                measureType = "none";
            var imageClasses = 'silky-variable-type-img';
            if (measureType !== null && measureType !== undefined)
                imageClasses = imageClasses + ' silky-variable-type-' + measureType;
            else
                imageClasses = imageClasses + ' silky-variable-type-none';

            var $item = $('<div style="white-space: nowrap;" class="silky-list-item silky-format-variable"></div>');
            $item.append('<div style="display: inline-block; overflow: hidden;" class="' + imageClasses + '"></div>');

            var displayValue = "";
            if (data !== null)
                displayValue = format.toString(data);
            $item.append('<div style="white-space: nowrap;  display: inline-block;" class="silky-list-item-value">' + displayValue + '</div>');

            this.$el.append($item);
        });
        return promise;
    };
};

module.exports = ListItemVariableLabel;
