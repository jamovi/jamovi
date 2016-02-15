
var _ = require('underscore')
var $ = require('jquery')

var SplitPanelSection = function(index, $panel, initData, parent) {

    this.parent = parent;
    this.listIndex = index;
    this.name = $panel.attr("id");

    if (_.isUndefined(this.name))
        throw "All splitter panels require an id attribute";

    $panel.css("position", "absolute");
    $panel.css("box-sizing", "border-box");

    this.panel = $panel;

    this.minWidth = -1;
    this.maxWidth = -1;
    this.strongEdge = "none";
    this.stretchyEdge = "none";
    this.preferedWidth = -1;
    this.level = 0;
    this._visible = true;
    this._lastWeakMinWidth = -1;
    this.isStrongMinWidth === false
    this._lastWeakMaxWidth = -1;
    this.isStrongMaxWidth === false;
    this._coreWidth = 0;
    this._covered = false;
    this._position = 0;
    this.sectionOnTop = false;
    this._stretchyNeighbours = "none";
    this._stuckTo = { left: 0, right: 0, reset: function() { this.left = 0; this.right = 0; } };
    this._nextSection = { left: null, right: null };


    this.initalise = function(initData) {
        if (_.isUndefined(initData.minWidth) === false)
            this.minWidth = initData.minWidth;

        if (_.isUndefined(initData.maxWidth) === false) {
            this.maxWidth = initData.maxWidth;
            if (_.isUndefined(initData.minWidth) === false && initData.maxWidth < initData.minWidth)
                throw "Max width must be greater or equal to min width";
        }

        if (_.isUndefined(initData.preferedWidth) === false)
            this.preferedWidth = initData.preferedWidth;

        if (_.isUndefined(initData.strongEdge) === false)
            this.strongEdge = initData.strongEdge;

        if (_.isUndefined(initData.level) === false)
            this.level = initData.level

        if (_.isUndefined(initData.initialWidth) === false)
            this.initialWidth = initData.initialWidth;

        if (_.isUndefined(initData.preferedWidth) === false)
            this.preferedWidth = initData.preferedWidth;

        if (initData.visible === false) {
            this.panel.css("opacity", initData.visible ? 1 : 0);
            this._visible = false;
            this.setCoreWidth(0);
        }
        else if (_.isUndefined(this.initialWidth) === false)
            this.panel.css("width", this._clipSizeToBounds(initData.initialWidth).clipped);
        else if (_.isUndefined(this.preferedWidth) === false)
            this.panel.css("width", this._clipSizeToBounds(initData.preferedWidth).clipped);


        if (_.isUndefined(initData.stretchyEdge) === false) {
            this.stretchyEdge = initData.stretchyEdge
            if (this.getVisibility()) {

                this.getNext("left", function(section) {
                    if ((this.stretchyEdge === "both" || this.stretchyEdge === "left")) {
                        if (section._stretchyNeighbours === "left")
                            section._stretchyNeighbours = "both";
                        else
                            section._stretchyNeighbours = "right";
                    }
                }, this);

                 this.getNext("right", function(section) {
                    if ((this.stretchyEdge === "both" || this.stretchyEdge === "right")) {
                        if (section._stretchyNeighbours === "right")
                            section._stretchyNeighbours = "both";
                        else
                            section._stretchyNeighbours = "left";
                    }
                }, this);

            }
        }
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
    }

    this._updateStretchyNeighbours = function() {
        this._stretchyNeighbours = "none";
        this.getNext("left", function(section) {
            if (section.getVisibility()) {
                if ((section.stretchyEdge === "both" || section.stretchyEdge === "right")) {
                    this._stretchyNeighbours = "left"
                }
            }
        }, this);

        this.getNext("right", function(section) {
            if (section.getVisibility()) {
                if ((section.stretchyEdge === "both" || section.stretchyEdge === "left")) {
                    if (this._stretchyNeighbours === "none")
                        this._stretchyNeighbours = "right";
                    else
                        this._stretchyNeighbours = "both";
                }
            }
        }, this);
    };

    this._clipSizeToBounds = function(value) {
        var minWidth = this.getMinWidth();
        if (value <= minWidth)
            return { clipped: minWidth, type: "minimum", unclipped: value };

        var maxWidth = this.getMaxWidth();
         if (maxWidth !== -1 && value >= maxWidth)
            return { clipped: maxWidth, type: "maximum", unclipped: value };

        return { clipped: value, type: "none", unclipped: value };
    };

    this.setMinWidth = function(value) {
        this._lastWeakMinWidth = -1;
        this.minWidth = value;
        this.isStrongMinWidth = false;
    };

    this.getMinWidth = function(ignoreCSS) {
        if ( ! ignoreCSS)
        {
            var cssData = this.panel.css("min-width");
            var cssMinWidth = parseInt(cssData);

            if (cssMinWidth !== 0)
            {
                if (this.isStrongMinWidth === false)
                    this._lastWeakMinWidth = this.minWidth;

                this.minWidth = cssMinWidth;
                this.isStrongMinWidth = true;
            }
            else if (this.isStrongMinWidth)
            {
                this.minWidth = this._lastWeakMinWidth;
                this._lastWeakMinWidth = -1;
                this.isStrongMinWidth = false;
            }
        }
        return this.minWidth;
    };

    this.setMaxWidth = function(value) {
        this._lastWeakMaxWidth = -1;
        this.maxWidth = value;
        this.isStrongMaxWidth = false;
    };

    this.getMaxWidth = function(ignoreCSS) {
        if ( ! ignoreCSS)
        {
            var cssData = this.panel.css("max-width");
            var cssMaxWidth = parseInt(cssData);

            if (isNaN(cssMaxWidth) === false)
            {
                if (this.isStrongMaxWidth === false)
                    this._lastWeakMaxWidth = this.maxWidth;

                this.maxWidth = cssMaxWidth;
                this.isStrongMaxWidth = true;
            }
            else if (this.isStrongMaxWidth)
            {
                this.maxWidth = this._lastWeakMaxWidth;
                this._lastWeakMaxWidth = -1;
                this.isStrongMaxWidth = false;
            }
        }

        return this.maxWidth;
    };

    this.reservedAbsoluteWidth = function() {
        if (isNaN(this._lastAbsoluteWidth))
            this._lastAbsoluteWidth = this.absoluteWidth();

        if (this._visible)
            return this.absoluteWidth();
        else {
            var reservedWidth = this._lastAbsoluteWidth;
            if (_.isUndefined(this.preferedWidth) === false && this._lastAbsoluteWidth < this.preferedWidth)
                reservedWidth = this.preferedWidth;

            return reservedWidth;
        }
    };

    this.setVisibility = function(value, animate) {

        if (value === this._visible)
            return false;

        if (value === false || isNaN(this._lastAbsoluteWidth))
            this._lastAbsoluteWidth = this.absoluteWidth();

        this._visible = value;
        if (animate)
            this._queueOpacityAnimation();

        this._stuckTo.reset();

        this.getNext("left", function(section) {
            section._updateStretchyNeighbours();
        }, this);

        this.getNext("right", function(section) {
            section._updateStretchyNeighbours();
        }, this);

        this.setCoreWidth(value ? this.reservedAbsoluteWidth() - (this.listIndex > 0 ? SplitPanelSection.sepWidth : 0) : 0, animate);

        return true;
    };

    this.getVisibility = function() {
        return this._visible;
    };

    this.isCovered = function() {
        return this._covered;
    };

    this._setCovered = function(value, animate) {
        if (this._covered !== value) {
            this._covered = value;
            this._queueOpacityAnimation();
        }

        if (value) {
            if (this._stretchyNeighbours === "left")
                this.getNext("left")._stickToEdge("right", 1, animate);
            else if (this._stretchyNeighbours === "right")
                this.getNext("right")._stickToEdge("left", 1, animate);
            else if (this._stretchyNeighbours === "both") {
                this.getNext("left")._stickToEdge("right", 0.5, animate);
                this.getNext("right")._stickToEdge("left", 0.5, animate);
            }
        }
        else
        {
            if (this._stretchyNeighbours === "left")
                this.getNext("left")._releaseFromEdge("right");
            else if (this._stretchyNeighbours === "right")
                this.getNext("right")._releaseFromEdge("left");
            else if (this._stretchyNeighbours === "both") {
                this.getNext("left")._releaseFromEdge("right");
                this.getNext("right")._releaseFromEdge("left");
            }
        }
    };

    this.updateCoveredState = function() {
        if (this.minWidth !== -1 && this._coreWidth <= this.minWidth && this._stretchyNeighbours !== "none")
            this._setCovered(true, this._covered === false);
        else if (this._covered)
            this._setCovered(false);
    };

    this.coreWidth = function() {
        return this._coreWidth;
    }

    this.setCoreWidth = function(value, animate) {

        if (isNaN(value))
            throw "Core Width must be a number."

        var clippedInfo = this._clipSizeToBounds(value);
        var useNonclipped = this._covered || this._stretchyNeighbours !== "none" || this._visible === false;

        this._coreWidth = useNonclipped ? value : clippedInfo.clipped;

        this.updateCoveredState();

        this._queueWidthForDisplay(value, animate);
    }

    this._cachedWidth = -1;
    this._cachedPos = -1;
    this._animationCache = null;

    this._setAnimationValue = function(name, value) {

        if (this._animationCache === null)
            this._animationCache = { opacity: null, width: null, left: null, _lockedCount: 0, changed: false };

        if (this._animationCache[name] === null)
            this._animationCache[name] = { _locked: false };

        if (this._animationCache[name] !== value) {
            this._animationCache[name]["value"] =  value;
            this._animationCache[name]["_changed"] = true;
            this._animationCache["_changed"] = true;
        }
    }

    this._isAnimationActive = function(name) {
        if (_.isUndefined(name))
            return this._animationCache !== null;

        return this._animationCache !== null && this._animationCache[name] !== null;
    };

    this._queueOpacityAnimation = function() {

        this._setAnimationValue("opacity", (this._visible && !this._covered) ? 1 : 0);
    }

    this._queueWidthForDisplay = function(width, effect) {
        if (effect) {
            this._setAnimationValue("width", width);
            this._cachedWidth = -1;
        }
        else
            this._cachedWidth = width ;
    }

    this._queuePositionForDisplay = function(pos, effect) {
        if (effect) {
            this._setAnimationValue("left", pos);
            this._cachedPos = -1;
        }
        else
            this._cachedPos = pos ;
    }

    this._stickToEdge = function(edge, percent, animate) {
        this._stuckTo[edge] = percent;
        this._queueWidthForDisplay(this.coreWidth(), animate);
    };

    this._releaseFromEdge = function(edge) {
        this._stuckTo[edge] = 0;
        this._queueWidthForDisplay(this.coreWidth(), true);
    };

    this.amountStretched = function(edge) {
        var stretch = 0;
        if (this._visible) {
            this.getNext(edge, function(section) {
                stretch = this._stuckTo[edge] * this.getNext(edge).absoluteWidth();
            }, this);
        }
        return stretch;
    };

    this.offsetCoreWidth = function(value, animate) {

        this.setCoreWidth(this.coreWidth() + value, animate);
    }

    this.displayWidth = function() {

        var data = this.panel.css("width")

        return parseFloat(data);
    };

    this.lockAnimation = function(property) {
        if (this._animationCache[property]._locked !== true)
        {
            this._animationCache[property]._locked = true;
            this._animationCache["_lockedCount"] += 1;
            if (property === "left" || property === "width")
                this.parent.isLocked += 1;
        }
    };

    this.unlockAnimation = function(property) {
        if (this._animationCache[property]._locked === true)
        {
            this._animationCache[property]._locked = false;
            this._animationCache["_lockedCount"] -= 1;
            if (property === "left" || property === "width")
                this.parent.isLocked -= 1;
        }
    };

    this.hasLockedAnimation = function() {
        return this._animationCache["_lockedCount"] > 0;
    };

    this.updateDisplay = function() {

        var sepWidth = this.listIndex > 0 ? SplitPanelSection.sepWidth : 0;
        if (this._animationCache !== null  && this._animationCache["_changed"] === true) {
            if (this.hasLockedAnimation())
                this.panel.stop(true, true);

            if (this._cachedWidth > -1 && this._animationCache["width"] === null) {
                this._setAnimationValue("width", this._cachedWidth);
                this._cachedWidth = -1;
            }

            if (this._cachedPos > -1 && this._animationCache["left"] === null) {
                this._setAnimationValue("left", this._cachedPos);
                this._cachedPos = -1;
            }

            if (this._animationCache["width"] !== null)
                this._setAnimationValue("width", this._animationCache["width"].value + this.amountStretched("left") + this.amountStretched("right"));

            if (this._animationCache["left"] !== null) {
                if (this.listIndex > 0)
                    this._moveSplitterTo(this._animationCache["left"].value - this.amountStretched("left"));

                this._setAnimationValue("left", this._animationCache["left"].value + sepWidth - this.amountStretched("left"));
            }

            this.launchAnimation("opacity", this.sectionOnTop ? this.parent._fastDuration : this.parent._slowDuration);
            this.launchAnimation("width", this.sectionOnTop ? this.parent._slowDuration : this.parent._fastDuration);
            this.launchAnimation("left", this.sectionOnTop ? this.parent._slowDuration : this.parent._fastDuration);

            this._animationCache["_changed"] = false;
        }

        if (this._cachedWidth > -1) {
            this.panel.css("width", this._cachedWidth + this.amountStretched("left") + this.amountStretched("right"));
            this.panel.trigger("resized");
            this._cachedWidth = -1;
        }

        if (this._cachedPos > -1) {
            this._movePanelTo(this._cachedPos + sepWidth  - this.amountStretched("left"));
            if (this.listIndex > 0)
                this._moveSplitterTo(this._cachedPos - this.amountStretched("left"));
            this._cachedPos = -1;
        }

        if (this.listIndex > 0) {
            var splitter = this.getSplitter();
            if (this._visible)
                splitter.show();
            else
                splitter.hide();
        }
    };

    this.launchAnimation = function(property, duration) {
        if (this._animationCache[property] !== null) {
            var self = this;
            var obj = {};
            obj[property] = this._animationCache[property].value;
            this.panel.animate(obj, {
                duration: duration,
                queue: false,
                complete: function() {
                    self.animationComplete(property)
                }
            });
            this.lockAnimation(property);

            this._animationCache[property]["_changed"] = false;
        }
    };

    this.animationComplete = function(property) {

        this.unlockAnimation(property);

        if (this._animationCache[property]["_changed"] === false)
            this._animationCache[property] = null;

        if (this.hasLockedAnimation() === false && this._animationCache["_changed"] === false)
                this._animationCache = null;

        if (property === "width")
            this.panel.trigger("resized");
    };

    this.testCoreGrowth = function(x) {

        if (this._visible === false || this._animating)
            return 0;

        var oldWidth = this.coreWidth();
        var newWidth = oldWidth + x;

        newWidth = newWidth < 0 ? 0 : newWidth;

        if (this._covered === false && this._stretchyNeighbours === "none") {

            var minWidth = this.getMinWidth();
            if (minWidth !== -1)
                newWidth = newWidth < minWidth ? minWidth : newWidth;

            var maxWidth = this.getMaxWidth();
            if (maxWidth !== -1)
                newWidth = newWidth > maxWidth ? maxWidth : newWidth;
        }

        if (newWidth - oldWidth !== x)
            return newWidth - oldWidth;

        return x;
    },

    this.getSplitter = function() {
        if (this.listIndex === 0)
            return null;

        if (_.isUndefined(this._splitter)) {
            this._splitter = $('<div class="silky-splitpanel-splitter"></div>');
            this._splitter.css("position", "absolute");
            this._splitter.css("width", SplitPanelSection.sepWidth);
            this._splitter.css("left", this.panel.position().left - SplitPanelSection.sepWidth);
        }

        return this._splitter;
    }

    this.setHeight = function(value) {
        this.panel.css("height", value);
        if (this.listIndex > 0)
            this.getSplitter().css("height", value);
    };

    this.moveTo = function(pos, animate) {

        this._position = pos;
        this._queuePositionForDisplay(pos, animate);
    }

    this.offset = function(x, animate) {
        this.moveTo(this._position + x, animate)
    },

    this._movePanelTo = function(pos) {

        var position = pos;

        position = position < 0 ? 0 : position;
        position = position > window.innerWidth ? window.innerWidth : position;
        this.panel.css("left", position);
    },

    this._moveSplitterTo = function(pos) {

        var position = pos;
        var splitter = this.getSplitter();
        position = position < 0 ? 0 : position;
        position = position > window.innerWidth ? window.innerWidth : position;
        splitter.css("left", position);
    },

    this.absoluteWidth = function() {
        var absWidth = this.coreWidth();
        if (this.listIndex !== 0 && this.getVisibility())
            absWidth += SplitPanelSection.sepWidth;

        return absWidth;
    }

    this.absolutePosition = function() {
        return this._position;
    }

    this.setNextSection = function(edge, section) {
        this._nextSection[edge] = section;

        if (edge === "right") {
            if (section.stretchyEdge === "left") {
                if (this._stretchyNeighbours === "left")
                    this._stretchyNeighbours = "both";
                else
                    this._stretchyNeighbours = "right";
            }
        }
        else {
            if (section.stretchyEdge === "right") {
                if (this._stretchyNeighbours === "right")
                    this._stretchyNeighbours = "both";
                else
                    this._stretchyNeighbours = "left";
            }
        }
    };

    /*this.getHideButton = function() {
        return this.panel.find(".splitpanel-hide-button");
    };*/


    if (_.isUndefined(initData) === false)
        this.initalise(initData);
}

SplitPanelSection.sepWidth = 12;

module.exports = SplitPanelSection
