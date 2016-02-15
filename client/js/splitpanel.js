
var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $
var SilkyView = require('./view')
var SplitPanelSection = require('./splitpanelsection')

var SplitPanel = SilkyView.extend({
    className: "splitpanel",
    initialize: function() {

        this._resizing = false;
        this.isLocked = 0;

        this.$children = this.$el.children()

        this.$el.addClass("silky-splitpanel")
        this.$el.css("position", "relative");
        this.$el.css("overflow", "hidden");

        this._createSections();

        _.bindAll(this, "resized");
        $(window).on("resize", this.resized);
        $(document).mouseup(this, this._mouseUpGeneral);
        $(document).mousemove(this, this._mouseMoveGeneral);
    },

    _getLeftZero: function() {
        var leftZero = parseFloat(this.$el.css("padding-left"));
        if (isNaN(leftZero))
            return 0;
        return leftZero;
    },

    _isLocked: function() {
        return this.isLocked > 0;
    },

    _createSections: function() {
        this._sections = { _list: [] };

        var lastSection = null;
        for (var i = 0; i < this.$children.length; i++) {
            var section = this.getSection(i);
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

        var keyIsIndex = false;
        if (i === parseInt(i, 10))
            keyIsIndex = true;

        var data;
        if (keyIsIndex)
            data = this._sections._list[i];
        else
            data = this._sections[i];

        if (_.isUndefined(data))
            data = this._createPanel(i, {});

        return data;
    },

    addPanel: function(name, properties) {
        this.$el.append($('<div id="' + name + '">new Panel</div>'));
        this.$children  = this.$el.children();

        var section = this.getSection(name);

        if (_.isUndefined(this.firstSection))
            this.firstSection = section;

        if (section.listIndex > 0) {
            var leftSection = this.getSection(section.listIndex - 1);
            leftSection.setNextSection("right", section);
            section.setNextSection("left", leftSection);
         }

        section.initalise(properties);
    },

    addContent: function(name, $content) {
        var section = this.getSection(name);

        /*var hideButton = section.getHideButton();
        if (hideButton)
            hideButton.off('click');*/

        section.panel.empty();

        section.panel.append($content);

        /*hideButton = section.getHideButton();
        var self = this;
        if (hideButton) {
            hideButton.on("click", function(event) {
                self.setVisibility(section, false);
            });
        };*/
    },

    _fastDuration : 100,
    _slowDuration : 400,

    setVisibility: function(i, value) {

        var section = i;
        if (_.isUndefined(i.name))
            section = this.getSection(i);

        var direction = value ? -1 : 1;
        var wanted = direction * section.reservedAbsoluteWidth();

        if (this._isLocked() || section.setVisibility(value, true) === false)
            return;

        this.totalWidth = this.$el.width();

        var amountLeft = wanted;
        if (section.strongEdge === "right" && section.listIndex > 0) {

            section.getNext("left", function(nextSection) {
                if (amountLeft === 0) return false;

                var amount = nextSection.testCoreGrowth(amountLeft);
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

                    var amount = nextSection.testCoreGrowth(amountLeft);
                    if (amount !== 0) {
                        amountLeft -= amount;
                        nextSection.offsetCoreWidth(amount, true);
                    }

                    return true;
                });
            }
        }

        var leftPos = this._getLeftZero();

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {

            var width = currentSection.coreWidth();

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
        var keyIsIndex = false;
        if (i === parseInt(i, 10))
            keyIsIndex = true;

        var panel = null;
        var index = -1;

        if (keyIsIndex) {
            panel = $(this.$children[i]);
            index = i;
            if (panel === null)
                throw "Splitter panel doesn't exist.";
        }
        else {
            for (var j = 0; j < this.$children.length; j++) {
                var child = $(this.$children[j]);
                if (child.attr('id') === i) {

                    panel = child;
                    index = j;
                    break;
                }
            }
            if (panel === null)
                throw "Splitter panel doesn't exist.";
        }

        var section = new SplitPanelSection(index, panel, data, this);

        var self = this;
        panel.on("splitpanel-hide", function(event) {
            self.setVisibility(section, false);
        });

        /*var hideButton = section.getHideButton();
        var self = this;
        if (hideButton) {
            hideButton.on("click", function(event) {
                self.setVisibility(section, false);
            });
        };*/

        this._sections._list[section.listIndex] = section;
        this._sections[section.name] = section;

        return section;
    },

    render: function() {
        this._rendering = true;

        var totalHeight = this.$el.height()
        this.totalWidth = this.$el.width();

        var leftPos = this._getLeftZero();

        var lastSection = null;

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {

            currentSection.moveTo(leftPos);
            currentSection.setHeight(totalHeight);

            if (currentSection.getVisibility()) {
                if (_.isUndefined(currentSection.initialWidth) === false)
                    currentSection.setCoreWidth(currentSection.initialWidth);
                else if (currentSection.preferedWidth)
                    currentSection.setCoreWidth(currentSection.preferedWidth);
                else
                    currentSection.setCoreWidth(currentSection.displayWidth());
            }

            leftPos += currentSection.absoluteWidth();

            var splitter = currentSection.getSplitter();
            if (splitter !== null) {
                currentSection.panel.before(splitter);

                var data = { left: currentSection.getNext("left"), right: currentSection, self: this};
                splitter.on("mousedown", null, data, this.onMouseDown);
            }

            if (currentSection.getVisibility())
                lastSection = currentSection;

        }, this);

        lastSection.setCoreWidth(this._getLeftZero() + this.totalWidth - lastSection.absolutePosition() - SplitPanelSection.sepWidth);

        this._moveThroughSections(lastSection.getNext("right"), "right", function(currentSection) {
            currentSection.moveTo(this._getLeftZero() + this.totalWidth - SplitPanelSection.sepWidth)
        }, this);


        this.updateDisplay();

        this._rendering = false;
    },
    onMouseDown: function(event) {
        if (this._resizing === true || event.data === null)
            return;

        var data = event.data;
        var self = data.self;

        self._resizing = true;
        self._sizingData = data;
        self._startPosX = _.isUndefined(event.pageX) ? event.originalEvent.pageX : event.pageX;
        self._startPosY = _.isUndefined(event.pageY) ? event.originalEvent.pageY : event.pageY;

    },
    _mouseUpGeneral: function(event) {

        var self = event.data;
        if (self === null || self._resizing === false)
            return;

        self._sizingData = null;
        self._resizing = false;
    },
    _mouseMoveGeneral: function(event) {

        var self = event.data;
        if (self === null || self._resizing === false)
            return;

        var data = self._sizingData;

        var xpos = _.isUndefined(event.pageX) ? event.originalEvent.pageX : event.pageX;
        var ypos = _.isUndefined(event.pageY) ? event.originalEvent.pageY : event.pageY;

        var diffX = xpos - self._startPosX;
        var diffY = ypos - self._startPosY;

        self._startPosX = xpos;
        self._startPosY = ypos;

        if (self._isLocked())
            return;

        var leftPanelData = data.left;
        var testDiffX = leftPanelData.testCoreGrowth(diffX);
        while (testDiffX === 0 && leftPanelData.getNext("left") !== null)
        {
            leftPanelData = leftPanelData.getNext("left");
            testDiffX = leftPanelData.testCoreGrowth(diffX);
        }
        diffX = testDiffX;

        var rightPanelData = data.right;
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

            var currentSection = data.right;
            while (currentSection !== null && currentSection.listIndex <= rightPanelData.listIndex) {
                currentSection.offset(diffX);
                currentSection = currentSection.getNext("right");
            }

            var currentSection = data.left;
            while (currentSection !== null && currentSection.listIndex > leftPanelData.listIndex) {
                currentSection.offset(diffX);
                currentSection = currentSection.getNext("left");
            }
        }

        self.updateDisplay();
    },
    resized: function() {

        var totalHeight = this.$el.height()
        var newNetWidth = this.$el.width();
        var oldNetWidth = 0;

        this.totalWidth = this.$el.width();

        var levelData = [];

        var panelDataList = [];
        var newPanelWidths = [];

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            if (currentSection.listIndex > 0 && currentSection.getVisibility())
                newNetWidth -= SplitPanelSection.sepWidth;

            var level = currentSection.level;
            var width = currentSection.coreWidth();
            newPanelWidths[currentSection.listIndex] = width;
            oldNetWidth += width;
            if (_.isUndefined(levelData[level]))
                levelData[level] = { width: width, panelCount: 1, panelDataList: [ currentSection ] };
            else {
                levelData[level].width += width;
                levelData[level].panelCount += 1;
                levelData[level].panelDataList.push(currentSection);
            }
            panelDataList.push(currentSection);
        }, this);


        var netWidthDiff = newNetWidth - oldNetWidth;

        var currentLevel = 0;
        var nextLevel = -1;
        do {
            var levelWidthOffset = netWidthDiff / levelData[currentLevel].panelCount;
            nextLevel = -1;
            for (var i = 0; i < panelDataList.length; i++) {
                var panelData = panelDataList[i];

                if (panelData === null)
                    continue;

                if (panelData.level !== currentLevel) {

                    if (panelData.level > currentLevel && (panelData.level < nextLevel || nextLevel === -1))
                        nextLevel = panelData.level;

                    continue;
                }

                var oldWidth = newPanelWidths[i];
                var wantedWidth = oldWidth + levelWidthOffset;
                var possibleWidth =  oldWidth + panelData.testCoreGrowth(wantedWidth - oldWidth);

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

        var leftPos = this._getLeftZero();

        var lastSection = null;

        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            var newWidth = newPanelWidths[currentSection.listIndex];

            currentSection.moveTo(leftPos);
            currentSection.setHeight(totalHeight);
            currentSection.setCoreWidth(newWidth);

            leftPos += currentSection.absoluteWidth();

            if (currentSection.getVisibility())
                lastSection = currentSection;
        }, this);

        lastSection.setCoreWidth(this._getLeftZero() + this.totalWidth - lastSection.absolutePosition() - SplitPanelSection.sepWidth);

        this._moveThroughSections(lastSection.getNext("right"), "right", function(currentSection) {
            currentSection.moveTo(this._getLeftZero() + this.totalWidth - SplitPanelSection.sepWidth)
        }, this);


        this.updateDisplay();
    },
    updateDisplay: function() {
        this._moveThroughSections(this.firstSection, "right", function(currentSection) {
            currentSection.updateDisplay();
        }, this);
    }
})

module.exports = SplitPanel
