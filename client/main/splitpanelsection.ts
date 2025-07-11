
'use strict';

import $ from 'jquery';

const SplitPanelSection = function(index, $panel, initData, parent) {

    this.parent = parent;
    this.listIndex = index;
    this.name = $panel.attr("id");

    if (this.name === undefined)
        throw "All splitter panels require an id attribute";

    this.$panel = $panel;
    this._visible = true;
    this._nextSection = { left: null, right: null };
    this.adjustable = true;
    this.fixed = false;
    this.anchor = 'right';
    this.width = 0;
    this.lastWidth = null;

    this.initalise = function(initData) {
        if (initData.anchor !== undefined)
            this.anchor = initData.anchor;
        if (initData.adjustable !== undefined)
            this.adjustable = initData.adjustable;
        if (initData.fixed !== undefined)
            this.fixed = initData.fixed;
        if (initData.visible !== undefined)
            this.setVisibility(initData.visible);
    };

    this.getNext = function(direction, action, context) {
        var currentSection = this._nextSection[direction];
        if ( ! action)
            return currentSection;

        while (currentSection !== null) {
            if ( ! action.call(context, currentSection))
                break;
            currentSection = currentSection._nextSection[direction];
        }
    };

    this.setVisibility = function(value) {
        let changed = value !== this._visible;
        this._visible = value;
        let $splitter = this.getSplitter();
        if (value) {
            $panel.removeClass('hidden-panel');
            if ($splitter)
                $splitter.removeClass('hidden-panel');
        }
        else {
            $panel.addClass('hidden-panel');
            if ($splitter)
                $splitter.addClass('hidden-panel');
        }
        return changed;
    };

    this.getVisibility = function() {
        return this._visible;
    };

    this.getSplitter = function() {
        if (this.listIndex === 0)
            return null;

        if (this._splitter === undefined) {
            this._splitter = $('<div class="silky-splitpanel-splitter" role="separator" aria-label="Window Splitter"><div style="font-size: 21px; color: #b0b0b0a6;"><span class="mif-more-vert"></span></div><div class="click-panel"></div></div>');
            this._splitter.css('width', SplitPanelSection.sepWidth);
            this._splitter.css('grid-area',`2 / ${ this.listIndex * 2 } / -1 / span 1`);
        }
        return this._splitter;
    };

    this.getMinWidth = function() {
        return parseInt(this.$panel.css('min-width'));
    };

    this.setNextSection = function(edge, section) {
        this._nextSection[edge] = section;
    };

    if (initData !== undefined)
        this.initalise(initData);
};

SplitPanelSection.sepWidth = 12;

export default SplitPanelSection;
