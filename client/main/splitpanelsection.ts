
'use strict';

import type { SplitPanel } from "./splitpanel";
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

class SplitPanelSection extends HTMLElement {
    listIndex: number;
    name: string;
    parent: SplitPanel;
    _visible: boolean = true;
    adjustable: boolean = true;
    fixed: boolean = false;
    width: number = 0;
    anchor: ('left' | 'right' | 'none') = 'right';
    _nextSection: { left: SplitPanelSection | null, right: SplitPanelSection | null} = { left: null, right: null };
    _splitter: HTMLElement;
    lastWidth: number | null = null;

    constructor(index: number, name: string, initData, parent: SplitPanel) {
        super();

        this.setAttribute('id', name);
        this.name = name;
        this.parent = parent;
        this.listIndex = index;

        if (this.name === undefined)
            throw "All splitter panels require an id attribute";

        this.lastWidth = null;

        if (initData !== undefined) 
            this.initalise(initData);
    }

    initalise (initData) {
        if (initData.anchor !== undefined)
            this.anchor = initData.anchor;
        if (initData.adjustable !== undefined)
            this.adjustable = initData.adjustable;
        if (initData.fixed !== undefined)
            this.fixed = initData.fixed;
        if (initData.visible !== undefined)
            this.setVisibility(initData.visible);
    }

    getNext(direction: ('left' | 'right'), action?: (SplitPanelSection) => boolean, context?) {
        let currentSection = this._nextSection[direction];
        if ( ! action)
            return currentSection;

        while (currentSection !== null) {
            if ( ! action.call(context, currentSection))
                break;
            currentSection = currentSection._nextSection[direction];
        }
    }

    setVisibility(value: boolean) {
        let changed = value !== this._visible;
        this._visible = value;
        let $splitter = this.getSplitter();
        if (value) {
            this.classList.remove('hidden-panel');
            if ($splitter)
                $splitter.classList.remove('hidden-panel');
        }
        else {
            this.classList.add('hidden-panel');
            if ($splitter)
                $splitter.classList.add('hidden-panel');
        }
        return changed;
    }

    getVisibility() {
        return this._visible;
    }

    getSplitter() {
        if (this.listIndex === 0)
            return null;

        if (this._splitter === undefined) {
            this._splitter = HTML.parse('<div class="silky-splitpanel-splitter" role="separator" aria-label="Window Splitter"><div style="font-size: 21px; color: #b0b0b0a6;"><span class="mif-more-vert"></span></div><div class="click-panel"></div></div>');
            this._splitter.style.width = `${SplitPanelSectionSepWidth}px`;
            this._splitter.style.gridArea = `2 / ${ this.listIndex * 2 } / -1 / span 1`;
        }
        return this._splitter;
    }

    getMinWidth() {
        return parseInt(getComputedStyle(this).minWidth, 10);
    }

    setNextSection(edge: ('left' | 'right'), section:SplitPanelSection) {
        this._nextSection[edge] = section;
    }
}

customElements.define('jmv-splitsection', SplitPanelSection);


export const SplitPanelSectionSepWidth = 12;

export default SplitPanelSection;
