'use strict';

const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const SilkyView = require('./view');
const SplitPanelSection = require('./splitpanelsection');
const tarp = require('./utils/tarp');

const SplitPanel = SilkyView.extend({
    className: "splitpanel",

    initialize() {

        this._resizing = false;

        this.$el.addClass("silky-splitpanel");
        this.$el.css("position", "relative");
        this.$el.css("overflow", "hidden");

        this._allData = false;
        this._allResults = false;

        this.mode = 'mixed';
        this._optionsVisible = false;

        this._allowDocking = { left: false, right: false, both: false };

        this._sections = { _list: [] };

        $(document).mouseup(this, this._mouseUpGeneral);
        $(document).mousemove(this, this._mouseMoveGeneral);

        this._transition = Promise.resolve();

        this._initialWidthsSaved = false;
    },

    getSection(i) {
        if (i === parseInt(i, 10)) {
            if (i < 0)
                return this._sections._list[this._sections._list.length + i];
            else
                return this._sections._list[i];
        }

        return this._sections[i];
    },

    onWindowResize() {
        this._saveWidths();
    },

    addPanel(name, properties) {
        let $panel = $('<div id="' + name + '"></div>');

        let section = new SplitPanelSection(this._sections._list.length, $panel, {}, this);
        this._sections._list[section.listIndex] = section;
        this._sections[section.name] = section;

        $panel.on("splitpanel-hide", (event) => {
            this.setVisibility(section, false);
        });

        this.$el.append($panel);

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
    },

    async setVisibility(i, value) {

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

                optionsSection.$panel.addClass('initialised');

                this.optionsChanging = value ? 'opening' : 'closing';

                if (value) {
                    let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                    this._resultsWidth = columnTemplates[columnTemplates.length - 1];
                    this._otherWidth = parseInt(columnTemplates[0]) + parseInt(columnTemplates[1]) + parseInt(columnTemplates[2]);
                    this.allowDocking('left');
                }

                if (this.resetState())
                   this.normalise();

                optionsSection.setVisibility(value);
                this.onTransitioning();

                optionsSection.$panel.one('transitionend', async () => {
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
                });
            });
        });
    },

    _applyColumnTemplates(columnTemplates, normalise, clean) {
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

        this.$el.css('grid-template-columns', columnTemplates.join(' '));
    },

    normalise(clean) {
        let columnTemplates = this.$el.css('grid-template-columns').split(' ');
        this._applyColumnTemplates(columnTemplates, true, clean);
    },

    onTransitioning(layoutKey) {
        this.trigger('form-changed');
        if (layoutKey || ! this.transitionCheckActive) {
            this.transitionCheckActive = true;
            if ( ! layoutKey)
                layoutKey = this.$el.css('grid-template-columns') + ' ' + this.$el.outerHeight(true);

            setTimeout(() => {
                let nextLayoutKey = this.$el.css('grid-template-columns') + ' ' + this.$el.outerHeight(true);
                if (layoutKey !== nextLayoutKey)
                    this.onTransitioning(nextLayoutKey);
                else {
                    this.transitionCheckActive = false;
                }
            }, 50);
        }
    },

    applyToSections(action) {
        let section = this.firstSection;
        while (section !== null)
        {
            if (action(section) === false)
                return;

            section = section.getNext('right');
        }
    },

    render() {
        this.applyToSections((currentSection) => {

            let splitter = currentSection.getSplitter();
            if (splitter !== null) {
                currentSection.$panel.before(splitter);

                let data = { left: currentSection.getNext("left"), right: currentSection, self: this};
                splitter.on("mousedown", null, data, this.onMouseDown);
            }

        });
    },

    onMouseDown(event) {
        let data = event.data;
        let self = data.self;

        if (self._resizing === true || event.data === null)
            return;

        tarp.show('splitPanel');

        self._resizing = true;
        self._sizingData = data;
        self._startPosX = event.pageX === undefined ? event.originalEvent.pageX : event.pageX;
        self._startPosY = event.pageY === undefined ? event.originalEvent.pageY : event.pageY;

        self._allResults = false;
        self._allData = false;

        self.allowDocking('both');
    },

    allowDocking(type) {
        let changed = this._allowDocking[type] === false;
        this._allowDocking[type] = true;
        if (changed)
            this.normalise();
    },

    suspendDocking(type, silent) {
        if (this._allowDocking[type] === false)
            return;

        this._allowDocking[type] = false;
        if ( ! silent)
            this.normalise();
    },

    async _mouseUpGeneral(event) {

        let self = event.data;
        if (self === null || self._resizing === false)
            return;

        self._sizingData = null;
        tarp.hide('splitPanel');

        self._saveWidths();

        self._resizing = false;
        self.suspendDocking('both');

        await self.checkDockConditions(true);

        self.normalise();
    },

    _saveWidths() {
        if (! this._allData && ! this._allResults) {
            let columnTemplates = this.$el.css('grid-template-columns').split(' ');
            this.applyToSections((currentSection) => {
                currentSection.lastWidth = parseInt(columnTemplates[currentSection.listIndex * 2]);
                if (currentSection.listIndex * 2 === columnTemplates.length - 1)
                    currentSection.lastWidth -= 2;
            });

            if (this._resultsWidth) {
                let newOtherWidth = parseInt(columnTemplates[0]) + parseInt(columnTemplates[1]) + parseInt(columnTemplates[2]);
                this._resultsWidth = parseInt(columnTemplates[columnTemplates.length - 1]) + (newOtherWidth  - this._otherWidth);
                this._resultsWidth = `${ this._resultsWidth }px`;
                this._dataWidth = newOtherWidth;
            }
        }
    },

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
    },

    async _mouseMoveGeneral(event) {

        let self = event.data;
        if (self === null || self._resizing === false)
            return;

        self._resultsWidth = null;

        let data = self._sizingData;

        let xpos = event.pageX === undefined ? event.originalEvent.pageX : event.pageX;
        let ypos = event.pageY === undefined ? event.originalEvent.pageY : event.pageY;

        let diffX = xpos - self._startPosX;
        let diffY = ypos - self._startPosY;

        self._startPosX = xpos;
        self._startPosY = ypos;

        await self.modifyLayout(data, diffX);

        self._splittersMoved = true;
    },

    resetState() {

        if (this._sections._list.length !== 3)
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
    },

    setMode(mode, silent) {

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

                let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                if (mode === 'results') {

                    this.getSection(-1).$panel.css({ width: '', opacity: '' });

                    // Set layout grid state ///
                    this.getSection(-1).fixed = false;
                    this.getSection(0).adjustable = false;

                    let $dataPanel = this.getSection(0).$panel;
                    $dataPanel.css('width', columnTemplates[0]);

                    this._applyColumnTemplates(columnTemplates, true);
                    ///////////////////

                    this._allResults = true;
                    this._allData = false;

                    setTimeout(() => {
                        $dataPanel.css('width', '0px');
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            this.onTransitioning();  // this is here so that the resize event happens after transition to make it less jittery
                            //this.allowDocking('left');
                            if (this.resetState())
                               this.normalise(true);
                            $dataPanel.css('width', '');
                            resolve();
                        }, transitionTime);
                    }, transitionDelay);
                }
                else if (mode === 'data') {

                    this.getSection(0).$panel.css({ width: '', opacity: '' });

                    // Set layout grid state ///
                    this.getSection(-1).adjustable = false;
                    this.getSection(-1).fixed = false;
                    this.getSection(0).fixed = false;

                    let $resultsPanel = this.getSection(-1).$panel;
                    $resultsPanel.css('width', columnTemplates[columnTemplates.length - 1]);

                    this._applyColumnTemplates(columnTemplates, true);
                    //////////////////

                    this._allResults = false;
                    this._allData = true;

                    setTimeout(() => {
                        $resultsPanel.css('width', '0px');
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            this.onTransitioning();
                            if (this.resetState())
                               this.normalise(true);
                            $resultsPanel.css('width', '');
                            resolve();
                        }, transitionTime);
                    }, transitionDelay);
                }
                else {
                    this._allResults = false;
                    this._allData = false;

                    if (changed && ! this._resizing) {
                        if (prevMode === 'results') {
                            this.getSection(0).$panel.css({ width: '', opacity: '' });

                            // Set layout grid state ///
                            this.getSection(-1).adjustable = false;
                            this.getSection(-1).fixed = false;
                            this.getSection(0).fixed = false;

                            let $resultsPanel = this.getSection(-1).$panel;
                            $resultsPanel.css('width', columnTemplates[columnTemplates.length - 1]);

                            this._applyColumnTemplates(columnTemplates, true);
                            //////////////////

                            setTimeout(() => {
                                let width = this.getSection(-1).lastWidth;
                                $resultsPanel.css('width', width + 'px');
                                setTimeout(() => {  //Normalises the columnTemplate after transition
                                    this.onTransitioning();
                                    this.refreshDockState(true);
                                    if (this.resetState())
                                       this.normalise(true);
                                    $resultsPanel.css('width', '');
                                    resolve();
                                }, transitionTime);
                            }, transitionDelay);
                        }
                        else if (prevMode === 'data') {
                            this.getSection(-1).$panel.css({ width: '', opacity: '' });

                            // Set layout grid state ///
                            this.getSection(0).adjustable = false;
                            this.getSection(-1).fixed = false;

                            let $dataPanel = this.getSection(0).$panel;
                            $dataPanel.css('width', columnTemplates[0]);

                            this._applyColumnTemplates(columnTemplates, true);
                            //////////////////

                            setTimeout(() => {
                                let width = this.getSection(0).lastWidth;
                                $dataPanel.css('width', width + 'px');
                                setTimeout(() => {  //Normalises the columnTemplate after transition
                                    this.onTransitioning();
                                    this.refreshDockState(true);
                                    if (this.resetState())
                                       this.normalise(true);
                                    $dataPanel.css('width', '');
                                    resolve();
                                }, transitionTime);
                            }, transitionDelay);
                        }
                    }
                    else
                        resolve();
                }

                if (! silent && changed)
                    this.$el.trigger('mode-changed');
            });
        });
    },

    refreshDockState(silent) {
        if (this.mode === 'mixed') {
            this.suspendDocking('right', silent);
            if (this._optionsVisible)
                this.allowDocking('left', silent);
            else
                this.suspendDocking('left', silent);
        }
        else {
            this.allowDocking('left', silent);
            this.allowDocking('right', silent);
        }
        this.checkDockConditions(false);
    },

    async modifyLayout(data, diffX) {
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
        let columnTemplates = this.$el.css('grid-template-columns').split(' ');
        let shrinkingSection = diffX < 0 ? leftSection : rightSection;
        let growingSection = diffX > 0 ? leftSection : rightSection;

        let shrinkingIndex = parseInt(shrinkingSection.$panel.css('grid-column-start')) - 1;
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

        let growingIndex = parseInt(growingSection.$panel.css('grid-column-start')) - 1;
        let grownWidth = parseInt(columnTemplates[growingIndex]) + Math.abs(diffX);
        if (growingSection.width != grownWidth) {
            columnTemplates[growingIndex] = `${ grownWidth }px`;
            growingSection.width = grownWidth;
            changed = true;
        }

        rightSection.$panel.css('width', '');
        leftSection.$panel.css('width', '');

        if (changed) {
            this.onTransitioning();
            this._applyColumnTemplates(columnTemplates, true);
            await this.checkDockConditions(false);
        }
    },

    async checkDockConditions(updateMode) {
        return new Promise((resolve) => {
            setTimeout( async() => {
                this.widths = [];
                let i = 0;
                let wideCount = 0;
                let widths = this.$el.css('grid-template-columns').split(' ');
                for (let j = 0; j < widths.length; j = j+2) {
                    this.widths[i] = parseInt(widths[j]);
                    if (this.widths[i] > 40)
                        wideCount += 1;

                    i += 1;
                }

                this._allResults = this.widths[0] <= 40 && (wideCount <= 1 || this._allResults);
                this._allData = this.widths[this.widths.length-1] <= 40 && wideCount <= 1;

                if (this.widths[0] <= 40)
                    this._sections._list[0].$panel.css('opacity', '0');
                else
                    this._sections._list[0].$panel.css('opacity', '');

                if (this.widths[this.widths.length-1] <= 40)
                    this._sections._list[this._sections._list.length-1].$panel.css('opacity', '0');
                else
                    this._sections._list[this._sections._list.length-1].$panel.css('opacity', '');

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
});

module.exports = SplitPanel;
