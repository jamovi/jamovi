'use strict';

const $ = require('jquery');
const StatusbarButton = require('./statusbarbutton');


const Statusbar = function() {

    let html = `<div class="jmv-status-bar">
                    <div class="left-dock">
                    </div>
                    <div class="right-dock">
                    </div>
                </div>`;
    this.$el = $(html);

    this._infoLabels = {};

    this.addElement = function(id, $element, properties) {
        if (properties === undefined)
            properties = { };

        if (properties.dock === undefined)
            properties.dock = 'right';

        let item = { $el: $element, properties: properties };
        this._infoLabels[id] = item;

        let $el = this.$el.find('.' + properties.dock + '-dock');
        $el.append($element);

        return item;
    };

    this.addInfoLabel = function(id, properties) {
        if (properties === undefined)
            properties = { value: '' };

        let html = '<div class="jmv-status-bar-info-item" data-id="' + id + '">' + (properties.label === undefined ? properties.value : (properties.label + ' ' + properties.value)) + '</div>';

        this.addElement(id, $(html), properties);
    };

    this.updateInfoLabel = function(id, value) {
        let item = this._infoLabels[id];
        if (item.properties.value != value) {
            item.properties.value = value;
            item.$el.html((item.properties.label === undefined ? item.properties.value : (item.properties.label + ' ' + item.properties.value)));
        }
    };

    this.removeInfoLabel = function(id) {
        let item = this._infoLabels[id];
        item.$el.remove();
        delete this._infoLabels[id];
    };

    this.addActionButton = function(name, properties) {
        let button = new StatusbarButton(name);
        this.addElement(name, button.$el, properties);
    };
};

module.exports = Statusbar;
