'use strict';

const $ = require('jquery');
const GridControl = require('./gridcontrol');

class MultiContainer {
    constructor(params, containers) {
        GridControl.extendTo(this, params);

        this._containers = containers;

        this._namedContainers = {};
        for (let container of containers) {
            let name = container.getPropertyValue('name');
            if (name) {
                this._namedContainers[name] = container;
                container.$el.addClass('container-hidden');
                container.$el.attr('data-content-name', name);
            }
        }

        this._visibleContainer = null;

        this.$el = $('<div class="jmv-multi-container"></div>');
    }

    createItem() {
        for (let container of this._containers) {
            this.$el.append(container.$el);
        }
    }

    setContainer(name) {
        if (this._visibleContainer)
            this._visibleContainer.$el.addClass('container-hidden');
        
        this._visibleContainer = this._namedContainers[name];

        if (this._visibleContainer)
            this._visibleContainer.$el.removeClass('container-hidden');
    }
}

module.exports = MultiContainer;