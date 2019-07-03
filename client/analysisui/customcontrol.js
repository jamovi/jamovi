'use strict';

const $ = require('jquery');
const GridControl = require('./gridcontrol');
const RequestDataSupport = require('./requestdatasupport');

const CustomControl = function(params) {

    GridControl.extendTo(this, params);
    RequestDataSupport.extendTo(this);

    this.$el = $('<div class="silky-custom-control silky-control-margin-' + this.getPropertyValue("margin") + '"></div>');
    this.timeoutId = null;

    this.update = function() {
        this.trigger('update');
    };

    this.onDisposed = function() {
        if (this.observer)
            this.observer.disconnect();
    };

    this.onLoaded = function() {
        this.observer = new MutationObserver( (mutations) => {
            if (this.timeoutId === null) {
                this.timeoutId = setTimeout(() => {
                    this.timeoutId = null;
                    this.$el.trigger("contentchanged");
                }, 0);
            }
        } );

        this.observer.observe(this.$el[0], { attributes: true, childList: true, attributeOldValue: true });
    };

    this._override('onDataChanged', (baseFunction, data) => {
        if (data.dataType !== 'columns')
            return;

        if (data.dataInfo.nameChanged || data.dataInfo.measureTypeChanged || data.dataInfo.dataTypeChanged || data.dataInfo.countChanged)
            this.update();
    });
};

module.exports = CustomControl;
