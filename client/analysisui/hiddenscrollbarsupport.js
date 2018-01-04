'use strict';

const SuperClass = require('../common/superclass');

const HiddenScrollBarSupport = function() {

    this.timeoutId = null;
    this.timeoutId2 = null;
    this.noscroll = false;

    this.$el.scroll((event) => {
        this._resetScrollIssue(1000, 100);
    });

    this.$el.click((event) => {
        this._resetScrollIssue(-1, 500);
    });

    let MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

    let observer = new MutationObserver((mutations, observer) => {
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0){
                this._resetScrollIssue(-1, 500);
                break;
            }
        }
    });

    this._resetScrollIssue = function(delay, noScrollDelay) {
        noScrollDelay = noScrollDelay === undefined ? 100 : noScrollDelay;

        if (this.timeoutId)
            clearTimeout(this.timeoutId);

        if (this.timeoutId2)
            clearTimeout(this.timeoutId2);

        let reset = () => {
            this.noscroll = true;
            this.$el.addClass('mac-scroll-fix');
            this.timeoutId2 = setTimeout(() => {
                this.noscroll = false;
                this.$el.removeClass('mac-scroll-fix');
            }, noScrollDelay);
        };

        if (this.noscroll === false && delay >= 0)
            this.timeoutId = setTimeout (reset, delay);
        else
            reset();
    };

    observer.observe(this.$el[0], {
      childList: true,
      subtree: true
    });
};

SuperClass.create(HiddenScrollBarSupport);

module.exports = HiddenScrollBarSupport;
