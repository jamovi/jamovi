'use strict';

import { EventDistributor } from '../common/eventmap';
import SplitPanelSection from './splitpanelsection';

export class SplitPanel extends EventDistributor {

    _resizing: boolean = false;
    _allData: boolean = false;
    _allResults: boolean = false;
    mode: ('mixed' | 'data' | 'results') = 'mixed';
    _optionsVisible: boolean = false;
    _allowDocking: { left: boolean, right: boolean, both: boolean } = { left: false, right: false, both: false };
    _transition: Promise<void>;
    _initialWidthsSaved: boolean = false;
    firstSection: SplitPanelSection;
    _sections: { [name: string]: SplitPanelSection } = {};
    _sectionsList: SplitPanelSection[] = [];
    widths: number[];
    optionsChanging: 'opening' | 'closing' | null;
    _resultsWidth: string | null;
    _otherWidth: number;
    transitionCheckActive: boolean;
    _startPosX: number;
    _startPosY: number;
    _dataWidth: number;
    _splittersMoved: boolean;

    constructor() {
        super();

        this.classList.add('splitpanel');

        this.classList.add("silky-splitpanel");
        this.style.position = "relative";
        this.style.overflow = "hidden";

        this._transition = Promise.resolve();
    }

    getSection(i: number | string) {
        if (typeof i === 'number') {
            if (i < 0)
                return this._sectionsList[this._sectionsList.length + i];
            else
                return this._sectionsList[i];
        }

        return this._sections[i];
    }

    onWindowResize() {
        this._saveWidths();
    }

    addPanel(name: string, properties) {
        let section = new SplitPanelSection(this._sectionsList.length, name, {}, this);
        this._sectionsList[section.listIndex] = section;
        this._sections[section.name] = section;

        section.addEventListener("splitpanel-hide", (event) => {
            this.setVisibility(section, false);
        });

        this.append(section);

        if (this.firstSection === undefined)
            this.firstSection = section;

        if (section.listIndex > 0) {
            let leftSection = this.getSection(section.listIndex - 1);
            leftSection.setNextSection("right", section);
            section.setNextSection("left", leftSection);
         }

         section.initalise(properties);

         if (this.resetState())
            this.normalise();

        return section;
    }

    async setVisibility(i, value) {

        let callId = Math.floor(Math.random() * 1000);

        if (this._optionsVisible === value)
            return;

        this._optionsVisible = value;

        this._transition = this._transition.then(() => {
            return new Promise(async (resolve) => {

                let optionsSection = this.getSection(1);
                if (optionsSection.getVisibility() === value) {
                    resolve();
                    return;
                }

                optionsSection.classList.add('initialised');

                this.optionsChanging = value ? 'opening' : 'closing';

                if (value) {
                    let columnTemplates = getComputedStyle(this).gridTemplateColumns.split(' ');
                    this._resultsWidth = columnTemplates[columnTemplates.length - 1];
                    this._otherWidth = parseInt(columnTemplates[0]) + parseInt(columnTemplates[1]) + parseInt(columnTemplates[2]);
                    this.allowDocking('left');
                }

                if (this.resetState())
                   this.normalise();

                optionsSection.setVisibility(value);
                this.onTransitioning();

                optionsSection.addEventListener('transitionend', async () => {
                    await this.checkDockConditions(false);
                    if (value === false) {
                        this.suspendDocking('left');
                        this._resultsWidth = null;
                    }
                    this.optionsChanging = null;
                    if (this.resetState())
                       this.normalise(true);

                    if (value === false)
                        this._saveWidths();

                    resolve();
                }, { once:true });
            });
        });
    }

    _applyColumnTemplates(columnTemplates, normalise: boolean, clean?) {
        if (normalise)
            this._normaliseWidths(columnTemplates, clean);

        if (this.getSection(0).adjustable) {
            if ((this._allowDocking.left === false && this._allowDocking.both === false) && ! this._allResults)
                columnTemplates[0] = `minmax(200px, ${columnTemplates[0]} )`;
            else
                columnTemplates[0] = `minmax(auto, ${columnTemplates[0]} )`;
        }

        if (this.getSection(-1).adjustable) {
            if ((this._allowDocking.right === false && this._allowDocking.both === false) && ! this._allData)
                columnTemplates[columnTemplates.length - 1] = `minmax(200px, ${columnTemplates[columnTemplates.length - 1]} )`;
            else
                columnTemplates[columnTemplates.length - 1] = `minmax(auto, ${columnTemplates[columnTemplates.length - 1]} )`;
        }

        this.style.gridTemplateColumns = columnTemplates.join(' ');
    }

    normalise(clean?) {
        let columnTemplates = getComputedStyle(this).gridTemplateColumns.split(' ');
        this._applyColumnTemplates(columnTemplates, true, clean);
    }

    getLayoutKey(el: HTMLElement) {
        const style = getComputedStyle(el);
        const gridTemplate = style.gridTemplateColumns;

        // outerHeight(true) includes margin, so we calculate that manually
        const height = el.offsetHeight;
        const marginTop = parseFloat(style.marginTop) || 0;
        const marginBottom = parseFloat(style.marginBottom) || 0;
        const outerHeight = height + marginTop + marginBottom;

        return gridTemplate + ' ' + outerHeight;
    }

    onTransitioning(layoutKey?: string) {
        let event = new CustomEvent('form-changed');
        this.dispatchEvent(event);
        if (layoutKey || ! this.transitionCheckActive) {
            this.transitionCheckActive = true;
            if ( ! layoutKey)
                layoutKey = this.getLayoutKey(this);

            setTimeout(() => {
                let nextLayoutKey = this.getLayoutKey(this);
                if (layoutKey !== nextLayoutKey)
                    this.onTransitioning(nextLayoutKey);
                else {
                    this.transitionCheckActive = false;
                }
            }, 50);
        }
    }

    applyToSections(action: (SplitPanelSection) => (boolean | void)) {
        let section = this.firstSection;
        while (section !== null)
        {
            if (action(section) === false)
                return;

            section = section.getNext('right');
        }
    }

    render() {
        this.applyToSections((currentSection: SplitPanelSection) => {

            let splitter = currentSection.getSplitter();
            if (splitter !== null) {
                currentSection.before(splitter);

                let data = { left: currentSection.getNext("left"), right: currentSection, self: this};

                splitter.addEventListener("pointerdown", (event: PointerEvent) => {
                    let button = event.button;

                    splitter.setPointerCapture(event.pointerId);

                    this._resizing = true;
                    this._startPosX = event.pageX;
                    this._startPosY = event.pageY;

                    this._allResults = false;
                    this._allData = false;

                    this.allowDocking('both');

                    ['pointerup', 'pointercancel'].forEach(eventName => splitter.addEventListener(eventName, async (event: PointerEvent) => {
                        if (this._resizing === false)
                            return;

                        splitter.releasePointerCapture(event.pointerId);

                        this._saveWidths();

                        this._resizing = false;
                        this.suspendDocking('both');

                        await this.checkDockConditions(true);

                        this.normalise();
                    }, { once:true }));
                });

                splitter.addEventListener("pointermove", async (event: PointerEvent) => {
                    if (this._resizing === false)
                        return;

                    this._resultsWidth = null;

                    let xpos = event.pageX;
                    let ypos = event.pageY;

                    let diffX = xpos - this._startPosX;
                    let diffY = ypos - this._startPosY;

                    this._startPosX = xpos;
                    this._startPosY = ypos;

                    await this.modifyLayout(data, diffX);

                    this._splittersMoved = true;
                });
            }
        });
    }

    allowDocking(type: ('left' | 'right' | 'both')) {
        let changed = this._allowDocking[type] === false;
        this._allowDocking[type] = true;
        if (changed)
            this.normalise();
    }

    suspendDocking(type: ('left' | 'right' | 'both'), silent?: boolean) {
        if (this._allowDocking[type] === false)
            return;

        this._allowDocking[type] = false;
        if ( ! silent)
            this.normalise();
    }

    _saveWidths() {
        if (! this._allData && ! this._allResults) {
            let columnTemplates = getComputedStyle(this).gridTemplateColumns.split(' ');
            this.applyToSections((currentSection) => {
                currentSection.lastWidth = parseInt(columnTemplates[currentSection.listIndex * 2]);
                if (currentSection.listIndex * 2 === columnTemplates.length - 1)
                    currentSection.lastWidth -= 2;
            });

            if (this._resultsWidth) {
                let newOtherWidth = parseInt(columnTemplates[0]) + parseInt(columnTemplates[1]) + parseInt(columnTemplates[2]);
                this._resultsWidth = `${ parseInt(columnTemplates[columnTemplates.length - 1]) + (newOtherWidth  - this._otherWidth) }px`;
                this._dataWidth = newOtherWidth;
            }
        }
    }

    _normaliseWidths(columnTemplates, clean) {

        if (this._resultsWidth)
            columnTemplates[columnTemplates.length - 1] = this._resultsWidth;

        let total = 0;
        let widthValues = [];
        let i = 0;
        this.applyToSections((currentSection) => {
            if (currentSection.adjustable) {
                if (currentSection.fixed === false) {
                    widthValues[i] = parseInt(columnTemplates[i*2]);
                    total += widthValues[i];
                }
                else
                    widthValues[i] = columnTemplates[i*2];
            }
            else
                widthValues[i] = null;
            i += 1;
        });

        for (let i = 0; i < widthValues.length; i++) {
            if (widthValues[i] !== null) {
                if (clean && ((i === 0 && this._allResults) || (i === widthValues.length - 1 && this._allData)))
                        columnTemplates[i*2] = '0fr';
                else if (typeof widthValues[i] === 'string')
                    columnTemplates[i*2] = widthValues[i];
                else {
                    if (total === 0)
                        columnTemplates[i*2] = '10fr';
                    else
                        columnTemplates[i*2] = (widthValues[i] * 10) / total + 'fr';
                }
            }
            else
                columnTemplates[i*2] = 'min-content';

            if (i != 0)
                columnTemplates[i*2 - 1] = 'min-content';
        }
    }

    resetState() {

        if (this._sectionsList.length !== 3)
            return false;

        let dataPanel = this.getSection(0);
        let resultsPanel = this.getSection(-1);

        if (this.mode === 'data' || (this.mode === 'mixed' && this.optionsChanging)) {
            resultsPanel.fixed = true;
            dataPanel.fixed = false;
        }
        else {
            resultsPanel.fixed = false;
            dataPanel.fixed = true;
        }

        resultsPanel.adjustable = true;
        dataPanel.adjustable = true;

        return true;
    }

    setMode(mode, silent?: boolean) {

        if (this._initialWidthsSaved === false)
            this._saveWidths();

        this._transition = this._transition.then(() => {
            return new Promise(async (resolve) => {
                let changed = mode != this.mode;
                let prevMode = this.mode;
                this.mode = mode;

                if (mode !== 'mixed' || (changed && ! this._resizing)) {  //this condition is here because low down mixed mode doesn't always get run
                    this.allowDocking('left');
                    this.allowDocking('right');
                }

                this._resultsWidth = null;

                let transitionTime = 300;
                let transitionDelay = 20;

                let columnTemplates = getComputedStyle(this).gridTemplateColumns.split(' ');
                if (mode === 'results') {

                    let section = this.getSection(-1);
                    section.style.width = '';
                    section.style.opacity = '';

                    // Set layout grid state ///
                    this.getSection(-1).fixed = false;
                    this.getSection(0).adjustable = false;

                    let $dataPanel = this.getSection(0);
                    $dataPanel.style.width = columnTemplates[0];

                    this._applyColumnTemplates(columnTemplates, true);
                    ///////////////////

                    this._allResults = true;
                    this._allData = false;

                    setTimeout(() => {
                        $dataPanel.style.width = '0px';
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            this.onTransitioning();  // this is here so that the resize event happens after transition to make it less jittery
                            if (this.resetState())
                               this.normalise(true);
                            $dataPanel.style.width = '';
                            resolve();
                        }, transitionTime);
                    }, transitionDelay);
                }
                else if (mode === 'data') {

                    let section = this.getSection(0);
                    section.style.width = '';
                    section.style.opacity = '';

                    // Set layout grid state ///
                    this.getSection(-1).adjustable = false;
                    this.getSection(-1).fixed = false;
                    this.getSection(0).fixed = false;

                    let $resultsPanel = this.getSection(-1);
                    $resultsPanel.style.width = columnTemplates[columnTemplates.length - 1];

                    this._applyColumnTemplates(columnTemplates, true);
                    //////////////////

                    this._allResults = false;
                    this._allData = true;

                    setTimeout(() => {
                        $resultsPanel.style.width = '0px';
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            this.onTransitioning();
                            if (this.resetState())
                               this.normalise(true);
                            $resultsPanel.style.width = '';
                            resolve();
                        }, transitionTime);
                    }, transitionDelay);
                }
                else {
                    this._allResults = false;
                    this._allData = false;

                    if (changed && ! this._resizing) {
                        if (prevMode === 'results') {
                            let section = this.getSection(0);
                            section.style.width = '';
                            section.style.opacity = '';

                            // Set layout grid state ///
                            this.getSection(-1).adjustable = false;
                            this.getSection(-1).fixed = false;
                            this.getSection(0).fixed = false;

                            let $resultsPanel = this.getSection(-1);
                            $resultsPanel.style.width = `${columnTemplates[columnTemplates.length - 1]}px`;

                            this._applyColumnTemplates(columnTemplates, true);
                            //////////////////

                            setTimeout(() => {
                                let width = this.getSection(-1).lastWidth;
                                $resultsPanel.style.width = `${width}px`;
                                setTimeout(() => {  //Normalises the columnTemplate after transition
                                    this.onTransitioning();
                                    this.refreshDockState(true);
                                    if (this.resetState())
                                       this.normalise(true);
                                    $resultsPanel.style.width = '';
                                    resolve();
                                }, transitionTime);
                            }, transitionDelay);
                        }
                        else if (prevMode === 'data') {
                            let section = this.getSection(-1);
                            section.style.width = '';
                            section.style.opacity = '';

                            // Set layout grid state ///
                            this.getSection(0).adjustable = false;
                            section.fixed = false;

                            let $dataPanel = this.getSection(0);
                            $dataPanel.style.width = columnTemplates[0];

                            this._applyColumnTemplates(columnTemplates, true);
                            //////////////////

                            setTimeout(() => {
                                let width = this.getSection(0).lastWidth;
                                $dataPanel.style.width = `${width}px`;
                                setTimeout(() => {  //Normalises the columnTemplate after transition
                                    this.onTransitioning();
                                    this.refreshDockState(true);
                                    if (this.resetState())
                                       this.normalise(true);
                                    $dataPanel.style.width = '';
                                    resolve();
                                }, transitionTime);
                            }, transitionDelay);
                        }
                    }
                    else
                        resolve();
                }

                if (! silent && changed) {
                    let event = new CustomEvent('mode-changed');
                    this.dispatchEvent(event);
                }
            });
        });
    }

    refreshDockState(silent?: boolean) {
        if (this.mode === 'mixed') {
            this.suspendDocking('right', silent);
            if (this._optionsVisible)
                this.allowDocking('left');
            else
                this.suspendDocking('left', silent);
        }
        else {
            this.allowDocking('left');
            this.allowDocking('right');
        }
        this.checkDockConditions(false);
    }

    async modifyLayout(data: { left: SplitPanelSection, right: SplitPanelSection }, diffX) {
        if (diffX === 0)
            return;

        let leftSection = data.left;
        while (leftSection && leftSection.adjustable === false)
            leftSection = leftSection.getNext('left');
        if ( ! leftSection || leftSection.adjustable === false)
            return;

        let rightSection = data.right;
        while (rightSection && rightSection.adjustable === false)
            rightSection = rightSection.getNext('right');
        if ( ! rightSection || rightSection.adjustable === false)
            return;

        let changed = false;
        let columnTemplates = getComputedStyle(this).gridTemplateColumns.split(' ');
        let shrinkingSection = diffX < 0 ? leftSection : rightSection;
        let growingSection = diffX > 0 ? leftSection : rightSection;

        let shrinkingIndex = parseInt(getComputedStyle(shrinkingSection).gridColumnStart) - 1;
        let currentWidth = parseInt(columnTemplates[shrinkingIndex]);
        let shrunkWidth = currentWidth - Math.abs(diffX);

        let minWidth = shrinkingSection.getMinWidth();
        if (shrunkWidth < minWidth) {
            shrunkWidth = minWidth;
            diffX = minWidth - currentWidth; //how much we actually moved;
        }
        else if (shrunkWidth < 0) {
            shrunkWidth = 0;
            diffX = -currentWidth; //how much we actually moved;
        }

        if (shrinkingSection.width != shrunkWidth) {
            columnTemplates[shrinkingIndex] = `${ shrunkWidth }px`;
            shrinkingSection.width = shrunkWidth;
            changed = true;
        }

        let growingIndex = parseInt(getComputedStyle(growingSection).gridColumnStart) - 1;
        let grownWidth = parseInt(columnTemplates[growingIndex]) + Math.abs(diffX);
        if (growingSection.width != grownWidth) {
            columnTemplates[growingIndex] = `${ grownWidth }px`;
            growingSection.width = grownWidth;
            changed = true;
        }

        rightSection.style.width = '';
        leftSection.style.width = '';

        if (changed) {
            this.onTransitioning();
            this._applyColumnTemplates(columnTemplates, true);
            await this.checkDockConditions(false);
        }
    }

    async checkDockConditions(updateMode) {
        return new Promise<void>((resolve) => {
            setTimeout( async() => {
                this.widths = [];
                let i = 0;
                let wideCount = 0;
                let widths = getComputedStyle(this).gridTemplateColumns.split(' ');
                for (let j = 0; j < widths.length; j = j+2) {
                    this.widths[i] = parseInt(widths[j]);
                    if (this.widths[i] > 40)
                        wideCount += 1;

                    i += 1;
                }

                this._allResults = this.widths[0] <= 40 && (wideCount <= 1 || this._allResults);
                this._allData = this.widths[this.widths.length-1] <= 40 && wideCount <= 1;

                if (this.widths[0] <= 40)
                    this._sectionsList[0].style.opacity = '0';
                else
                    this._sectionsList[0].style.opacity = '';

                if (this.widths[this.widths.length-1] <= 40)
                    this._sectionsList[this._sectionsList.length-1].style.opacity = '0';
                else
                    this._sectionsList[this._sectionsList.length-1].style.opacity = '';

                if (updateMode) {
                    if (this._allResults)
                        await this.setMode('results');
                    else if (this._allData)
                        await this.setMode('data');
                    else
                        await this.setMode('mixed');
                }

                resolve();
            }, 0);
        });
    }
}

customElements.define('jmv-splitpanel', SplitPanel);
