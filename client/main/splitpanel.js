'use strict';

const _ = require('underscore');
const $ = require('jquery');
const Backbone = require('backbone');
Backbone.$ = $;
const SilkyView = require('./view');
const SplitPanelSection = require('./splitpanelsection');
const tarp = require('./utils/tarp');

const SplitPanel = SilkyView.extend({
    className: "splitpanel",

    initialize: function() {

        this._resizing = false;

        this.$el.addClass("silky-splitpanel");
        this.$el.css("position", "relative");
        this.$el.css("overflow", "hidden");

        this._allData = false;
        this._allResults = false;

        this.mode = 'mixed';

        this._sections = { _list: [] };

        $(document).mouseup(this, this._mouseUpGeneral);
        $(document).mousemove(this, this._mouseMoveGeneral);
    },

    getSection: function(i) {
        if (i === parseInt(i, 10)) {
            if (i < 0)
                return this._sections._list[this._sections._list.length + i];
            else
                return this._sections._list[i];
        }

        return this._sections[i];
    },

    addPanel: function(name, properties) {
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

        return section;
    },

    setVisibility: function(i, value) {

        let section = i;
        if (i.name === undefined)
            section = this.getSection(i);

        if (section.getVisibility() === value)
            return;

        if (value || this._splittersMoved) {
            this._splittersMoved = false;
            if (section.anchor === 'right')
                this._softenSection(section.getNext('left'), section);
            else
                this._softenSection(section.getNext('right'), section);
        }

        if (section.setVisibility(value)) {
            this.onTransitioning();
            section.$panel.one('transitionend', () => {
                //let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                //this._normaliseWidths(columnTemplates);
                //this.$el.css('grid-template-columns', columnTemplates.join(' '));

                this.checkDockConditions();
            });
        }

    },

    _softenSection: function(section, expandingSection) {
        let columnTemplates = this.$el.css('grid-template-columns').split(' ');
        let i = 0;
        this.applyToSections((currentSection) => {
            if (currentSection === section)
                columnTemplates[i*2] = '1fr';
            else if (currentSection === expandingSection) {
                columnTemplates[i*2] = 'auto';
                columnTemplates[i*2 - 1] = 'auto';
            }
            else
                columnTemplates[i*2] = `minmax(0px, ${ columnTemplates[i*2] })`;

            i += 1;
        });

        section.$panel.css('width', '');

        this._applyColumnTemplates(columnTemplates, false);
        //this.$el.css('grid-template-columns', columnTemplates.join(' '));
    },

    _applyColumnTemplates: function(columnTemplates, normalise) {
        if (normalise)
            this._normaliseWidths(columnTemplates);
        this.$el.css('grid-template-columns', columnTemplates.join(' '));
        this.onTransitioning();
    },

    onTransitioning: function(layoutKey) {
        this.trigger('form-changed');
        if (layoutKey || ! this.transitionCheckActive) {
            this.transitionCheckActive = true;
            if ( ! layoutKey)
                layoutKey = this.$el.css('grid-template-columns');

            setTimeout(() => {
                let nextLayoutKey = this.$el.css('grid-template-columns');
                if (layoutKey !== nextLayoutKey)
                    this.onTransitioning(nextLayoutKey);
                else
                    this.transitionCheckActive = false;
            }, 50);
        }
    },

    applyToSections: function(action) {
        let section = this.firstSection;
        while (section !== null)
        {
            if (action(section) === false)
                return;

            section = section.getNext('right');
        }
    },

    render: function() {
        this.applyToSections((currentSection) => {

            let splitter = currentSection.getSplitter();
            if (splitter !== null) {
                currentSection.$panel.before(splitter);

                let data = { left: currentSection.getNext("left"), right: currentSection, self: this};
                splitter.on("mousedown", null, data, this.onMouseDown);
            }

        });
    },

    onMouseDown: function(event) {
        if (this._resizing === true || event.data === null)
            return;

        tarp.show('splitPanel');
        let data = event.data;
        let self = data.self;

        self._resizing = true;
        self._sizingData = data;
        self._startPosX = event.pageX === undefined ? event.originalEvent.pageX : event.pageX;
        self._startPosY = event.pageY === undefined ? event.originalEvent.pageY : event.pageY;

        //self.setMode('mixed');

        this._allResults = false;
        this._allData = false;
    },

    _mouseUpGeneral: function(event) {

        let self = event.data;
        if (self === null || self._resizing === false)
            return;

        self._sizingData = null;
        tarp.hide('splitPanel');

        if (self._allResults) {
            self.setMode('results');
            //self.$el.trigger('only-results');
        }
        else if (self._allData) {
            self.setMode('data');
            //self.$el.trigger('only-data');
        }
        else
            self.setMode('mixed');

        self._resizing = false;
    },

    _normaliseWidths: function(columnTemplates) {
        let total = 0;
        let widthValues = [];
        let i = 0;
        this.applyToSections((currentSection) => {
            if (currentSection.adjustable) {
                widthValues[i] = parseInt(columnTemplates[i*2]);
                total += widthValues[i];
            }
            else
                widthValues[i] = null;
            i += 1;
        });

        for (let i = 0; i < widthValues.length; i++) {
            if (widthValues[i] !== null) {
                if (total === 0)
                    columnTemplates[i*2] = '10fr';
                else
                    columnTemplates[i*2] = (widthValues[i] * 10) / total + 'fr';
            }
            else
                columnTemplates[i*2] = 'min-content';

            if (i != 0)
                columnTemplates[i*2 - 1] = 'min-content';
        }
    },

    _mouseMoveGeneral: function(event) {

        let self = event.data;
        if (self === null || self._resizing === false)
            return;

        let data = self._sizingData;

        let xpos = event.pageX === undefined ? event.originalEvent.pageX : event.pageX;
        let ypos = event.pageY === undefined ? event.originalEvent.pageY : event.pageY;

        let diffX = xpos - self._startPosX;
        let diffY = ypos - self._startPosY;

        self._startPosX = xpos;
        self._startPosY = ypos;

        self.modifyLayout(data, diffX);

        self._splittersMoved = true;
    },

    setMode: function(mode, silent) {

        let changed = mode != this.mode;
        let prevMode = this.mode;
        this.mode = mode;

        let columnTemplates = this.$el.css('grid-template-columns').split(' ');
        if (mode === 'results') {
            this.getSection(-1).$panel.css({ width: '', opacity: '' });
            this.getSection(0).adjustable = false;
            this.getSection(0).$panel.css('width', columnTemplates[0]);
            setTimeout(() => {
                let $panel = this.getSection(0).$panel;
                $panel.css('width', '0px');
                setTimeout(() => {  //Normalises the columnTemplate after transition
                    let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                    this._applyColumnTemplates(columnTemplates, true);
                    $panel.css('width', '');
                }, 300);
            }, 0);

            this._allResults = true;
            this._allData = false;

            this._applyColumnTemplates(columnTemplates, true);
            this.getSection(0).adjustable = true;
        }
        else if (mode === 'data') {
            this.getSection(0).$panel.css({ width: '', opacity: '' });
            this.getSection(-1).adjustable = false;
            this.getSection(-1).$panel.css('width', columnTemplates[columnTemplates.length - 1]);
            setTimeout(() => {
                let $panel = this.getSection(-1).$panel;
                $panel.css('width', '0px');
                setTimeout(() => {  //Normalises the columnTemplate after transition
                    let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                    this._applyColumnTemplates(columnTemplates, true);
                    $panel.css('width', '');
                }, 300);
            }, 0);

            this._allResults = false;
            this._allData = true;

            this._applyColumnTemplates(columnTemplates, true);
            this.getSection(-1).adjustable = true;
        }
        else {
            this._allResults = false;
            this._allData = false;

            if (changed && ! this._resizing) {
                if (prevMode === 'results') {
                    this.getSection(0).$panel.css({ width: '', opacity: '' });
                    this.getSection(-1).adjustable = false;
                    this.getSection(-1).$panel.css('width', columnTemplates[columnTemplates.length - 1]);
                    setTimeout(() => {
                        let width = window.innerWidth / 2;
                        let $panel = this.getSection(-1).$panel;
                        $panel.css('width', width + 'px');
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                            this._applyColumnTemplates(columnTemplates, true);
                            $panel.css('width', '');
                        }, 300);
                    }, 0);

                    this._applyColumnTemplates(columnTemplates, true);
                    this.getSection(-1).adjustable = true;
                }
                else if (prevMode === 'data') {
                    this.getSection(-1).$panel.css({ width: '', opacity: '' });
                    this.getSection(0).adjustable = false;
                    this.getSection(0).$panel.css('width', columnTemplates[0]);
                    setTimeout(() => {
                        let width = window.innerWidth / 2;
                        let $panel = this.getSection(0).$panel;
                        $panel.css('width', width + 'px');
                        setTimeout(() => {  //Normalises the columnTemplate after transition
                            let columnTemplates = this.$el.css('grid-template-columns').split(' ');
                            this._applyColumnTemplates(columnTemplates, true);
                            $panel.css('width', '');
                        }, 300);
                    }, 0);

                    this._applyColumnTemplates(columnTemplates, true);
                    this.getSection(0).adjustable = true;
                }
            }
        }

        if (! silent && changed)
            this.$el.trigger('mode-changed');

    },

    modifyLayout: function(data, diffX) {
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
            this._applyColumnTemplates(columnTemplates, true);

            this.checkDockConditions();
        }
    },

    checkDockConditions: function(delay) {
        if (delay === undefined)
            delay = 0;

        setTimeout(() => {
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

        }, delay);
    }



// <div style="grid-area: 2 / 1 / span 1 / span 1;width: 0px;overflow: visible;z-index: 500;align-self: center;transform: translate3d(0,0,0) rotate(90deg) translateY(9px) translateX(-50px);background-color: white;"><div style="font-weight: lighter;width: 100px;/* font-size: 150%; */height: 65px;text-align: center;line-height: 25px;/* -webkit-font-smoothing: antialiased; *//* z-index: 300; */color: #000000;background-color: rgb(230, 230, 230);border: 1px solid #ACACAC;/* transform: ////translate3d(0,0,0); */border-radius: 7px;">Data Panel</div></div>



});

module.exports = SplitPanel;
