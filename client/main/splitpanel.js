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
        this.isLocked = 0;

        this.$children = this.$el.children();

        this.$el.addClass("silky-splitpanel");
        this.$el.css("position", "relative");
        this.$el.css("overflow", "hidden");

        this._createSections();

        _.bindAll(this, "resized");
        $(window).on("resize", () => { this.resized(); } );
        $(document).mouseup(this, this._mouseUpGeneral);
        $(document).mousemove(this, this._mouseMoveGeneral);
    },

    _getLeftZero: function() {
        let leftZero = parseFloat(this.$el.css("padding-left"));
        if (isNaN(leftZero))
            return 0;
        return leftZero;
    },

    _isLocked: function() {
        return this.isLocked > 0;
    },

    _createSections: function() {
        this._sections = { _list: [] };

        let lastSection = null;
        for (let i = 0; i < this.$children.length; i++) {
            let section = this.getSection(i);
            if (lastSection !== null) {
                section.setNextSection("left", lastSection);
                lastSection.setNextSection("right", section);
            }
            else
                this.firstSection = section;

            lastSection = section;
        }
    },

    getSection: function(i) {

        let keyIsIndex = false;
        if (i === parseInt(i, 10))
            keyIsIndex = true;

        let data;
        if (keyIsIndex)
            data = this._sections._list[i];
        else
            data = this._sections[i];

        if (data === undefined)
            data = this._createPanel(i, {});

        return data;
    },

    addPanel: function(name, properties) {
        this.$el.append($('<div id="' + name + '"></div>'));
        this.$children  = this.$el.children();

        let section = this.getSection(name);

        if (this.firstSection === undefined)
            this.firstSection = section;

        if (section.listIndex > 0) {
            let leftSection = this.getSection(section.listIndex - 1);
            leftSection.setNextSection("right", section);
            section.setNextSection("left", leftSection);
         }

        section.initalise(properties);
    },

    addContent: function(name, $content) {
        let section = this.getSection(name);

        section.$panel.empty();

        section.$panel.append($content);
    },

    _fastDuration : 100,
    _slowDuration : 400,

    setVisibility: function(i, value) {

        let section = i;
        if (i.name === undefined)
            section = this.getSection(i);

        let direction = value ? -1 : 1;
        let wanted = direction * section.reservedAbsoluteWidth();

        if (this._isLocked() || section.setVisibility(value, true) === false)
            return;

        this.totalWidth = this.$el.width();

        let amountLeft = wanted;
        if (section.strongEdge === "right" && section.listIndex > 0) {

            section.getNext("left", function(nextSection) {
                if (amountLeft === 0) return false;

                let amount = nextSection.testCoreGrowth(amountLeft);
                if (amount !== 0) {
                    amountLeft -= amount;
                    nextSection.offsetCoreWidth(amount, true);
                }

                return true;

            }, this);

            wanted = amountLeft;
            if (wanted !== 0) {
                section.getNext("right", function(nextSection) {
                    if (amountLeft === 0) return false;

                    let amount = nextSection.testCoreGrowth(amountLeft);
                    if (amount !== 0) {
                        amountLeft -= amount;
                        nextSection.offsetCoreWidth(amount, true);
                    }

                    return true;
                });
            }
        }

        let leftPos = this._getLeftZero();

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {

            let width = currentSection.coreWidth();

            currentSection.sectionOnTop = false;

            currentSection.moveTo(leftPos, true);

            if (currentSection.getNext("right") === null)
                currentSection.setCoreWidth(this._getLeftZero() + this.totalWidth - leftPos - SplitPanelSection.sepWidth, true);
            else
                currentSection.setCoreWidth(width, true);

            leftPos += currentSection.absoluteWidth();
        }, this);

        section.sectionOnTop = value === false;

        this.updateDisplay();
    },

    _moveThroughSections: function(section, direction, action, context) {
        while (section !== null)
        {
            if (action.call(context, section) === false)
                return;

            section = section.getNext(direction);
        }
    },

    _createPanel: function(i, data) {
        let keyIsIndex = false;
        if (i === parseInt(i, 10))
            keyIsIndex = true;

        let panel = null;
        let index = -1;

        if (keyIsIndex) {
            panel = $(this.$children[i]);
            index = i;
            if (panel === null)
                throw "Splitter panel doesn't exist.";
        }
        else {
            for (let j = 0; j < this.$children.length; j++) {
                let child = $(this.$children[j]);
                if (child.attr('id') === i) {

                    panel = child;
                    index = j;
                    break;
                }
            }
            if (panel === null)
                throw "Splitter panel doesn't exist.";
        }

        let section = new SplitPanelSection(index, panel, data, this);

        panel.on("splitpanel-hide", (event) => {
            this.setVisibility(section, false);
        });

        this._sections._list[section.listIndex] = section;
        this._sections[section.name] = section;

        return section;
    },

    render: function() {
        this._rendering = true;

        let totalHeight = this.$el.height();
        this.totalWidth = this.$el.width();

        let leftPos = this._getLeftZero();

        let lastSection = null;

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {

            currentSection.moveTo(leftPos);
            currentSection.setHeight(totalHeight);

            if (currentSection.getVisibility()) {
                if (currentSection.initialWidth !== undefined)
                    currentSection.setCoreWidth(currentSection.initialWidth);
                else if (currentSection.preferredWidth)
                    currentSection.setCoreWidth(currentSection.preferredWidth);
                else
                    currentSection.setCoreWidth(currentSection.displayWidth());
            }

            leftPos += currentSection.absoluteWidth();

            let splitter = currentSection.getSplitter();
            if (splitter !== null) {
                currentSection.$panel.before(splitter);

                let data = { left: currentSection.getNext("left"), right: currentSection, self: this};
                splitter.on("mousedown", null, data, this.onMouseDown);
            }

            if (currentSection.getVisibility())
                lastSection = currentSection;

        }, this);

        lastSection.setCoreWidth(this._getLeftZero() + this.totalWidth - lastSection.absolutePosition() - SplitPanelSection.sepWidth);

        this._moveThroughSections(lastSection.getNext("right"), "right", function(currentSection) {
            currentSection.moveTo(this._getLeftZero() + this.totalWidth - SplitPanelSection.sepWidth);
        }, this);


        this.updateDisplay();

        this._rendering = false;
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

    },

    _mouseUpGeneral: function(event) {

        let self = event.data;
        if (self === null || self._resizing === false)
            return;

        self._sizingData = null;
        self._resizing = false;
        tarp.hide('splitPanel');
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

        if (self._isLocked())
            return;

        let leftPanelData = data.left;
        let testDiffX = leftPanelData.testCoreGrowth(diffX);
        while (testDiffX === 0 && leftPanelData.getNext("left") !== null)
        {
            leftPanelData = leftPanelData.getNext("left");
            testDiffX = leftPanelData.testCoreGrowth(diffX);
        }
        diffX = testDiffX;

        let rightPanelData = data.right;
        if (diffX !== 0) {
            testDiffX = rightPanelData.testCoreGrowth(-diffX);
            while (testDiffX === 0 && rightPanelData.getNext("right") !== null) {
                rightPanelData = rightPanelData.getNext("right");
                testDiffX = rightPanelData.testCoreGrowth(-diffX);
            }
        }

        diffX = -testDiffX;

        if (diffX !== 0)  {

            leftPanelData.offsetCoreWidth(diffX);
            rightPanelData.offsetCoreWidth(-diffX);

            let currentSection = data.right;
            while (currentSection !== null && currentSection.listIndex <= rightPanelData.listIndex) {
                currentSection.offset(diffX);
                currentSection = currentSection.getNext("right");
            }

            currentSection = data.left;
            while (currentSection !== null && currentSection.listIndex > leftPanelData.listIndex) {
                currentSection.offset(diffX);
                currentSection = currentSection.getNext("left");
            }
        }

        self.updateDisplay();
    },

    resized: function(size) {

        if (size === undefined)
            size = { height: this.$el.height(), width: this.$el.width() };

        let totalHeight = size.height;
        if (totalHeight === undefined)
            totalHeight = this.$el.height();

        let newNetWidth = size.width;
        if (newNetWidth === undefined)
            newNetWidth = this.$el.width();

        let oldNetWidth = 0;

        this.totalWidth = this.$el.width();

        let levelData = [];

        let panelDataList = [];
        let newPanelWidths = [];

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            if (currentSection.listIndex > 0 && currentSection.getVisibility())
                newNetWidth -= SplitPanelSection.sepWidth;

            let level = currentSection.level;
            let width = currentSection.coreWidth();
            newPanelWidths[currentSection.listIndex] = width;
            oldNetWidth += width;
            if (levelData[level] === undefined)
                levelData[level] = { width: width, panelCount: 1, panelDataList: [ currentSection ] };
            else {
                levelData[level].width += width;
                levelData[level].panelCount += 1;
                levelData[level].panelDataList.push(currentSection);
            }
            panelDataList.push(currentSection);
        }, this);


        let netWidthDiff = newNetWidth - oldNetWidth;

        let currentLevel = 0;
        let nextLevel = -1;
        do {
            let levelWidthOffset = netWidthDiff / levelData[currentLevel].panelCount;
            nextLevel = -1;
            for (let i = 0; i < panelDataList.length; i++) {
                let panelData = panelDataList[i];

                if (panelData === null)
                    continue;

                if (panelData.level !== currentLevel) {

                    if (panelData.level > currentLevel && (panelData.level < nextLevel || nextLevel === -1))
                        nextLevel = panelData.level;

                    continue;
                }

                let oldWidth = newPanelWidths[i];
                let wantedWidth = oldWidth + levelWidthOffset;
                let possibleWidth =  oldWidth + panelData.testCoreGrowth(wantedWidth - oldWidth);

                newPanelWidths[i] = possibleWidth;

                netWidthDiff -= possibleWidth - oldWidth;
                if (wantedWidth !== possibleWidth) {
                    panelDataList[i] = null;
                    i = -1;
                }
                if (netWidthDiff === 0) {
                    nextLevel = -1;
                    break;
                }
            }
            currentLevel = nextLevel;
        } while (currentLevel !== -1);

        let leftPos = this._getLeftZero();

        let lastSection = null;

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            let newWidth = newPanelWidths[currentSection.listIndex];

            currentSection.moveTo(leftPos);
            currentSection.setHeight(totalHeight);
            currentSection.setCoreWidth(newWidth);

            leftPos += currentSection.absoluteWidth();

            if (currentSection.getVisibility())
                lastSection = currentSection;
        }, this);

        lastSection.setCoreWidth(this._getLeftZero() + this.totalWidth - lastSection.absolutePosition() - SplitPanelSection.sepWidth);

        this._moveThroughSections(lastSection.getNext("right"), "right", function(currentSection) {
            currentSection.moveTo(this._getLeftZero() + this.totalWidth - SplitPanelSection.sepWidth);
        }, this);


        this.updateDisplay();
    },

    updateDisplay: function() {
        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            currentSection.updateDisplay();
        }, this);
    }
});

module.exports = SplitPanel;
