'use strict';

const $ = require('jquery');

class Placeholder {
    constructor(index, label) {
        this.$el = $(`<button class="jmv-ribbon-button jmv-ribbon-temp-button" data-name="${index}">
        <div class="jmv-ribbon-button-icon placeholder-icon"></div>
        <div class="jmv-ribbon-button-label placeholder-label">${label}</div>
        </button>`);
        this.dock = 'left';
    }
}

module.exports = Placeholder;
