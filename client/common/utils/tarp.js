
'use strict';

const $ = require('jquery');

let $tarp;
let canCancel = true;
let promise;
let resolvePromise;
let rejectPromise;

const init = function() {
    if ($tarp === undefined) {
        $tarp = $(`<div style="
            width: 100% ;
            height: 100% ;
            position: absolute ;
            top: 0 ;
            left: 0 ;
            background-color: #00000059 ;
            display: none ;
            opacity: 0 ;
        "></div>`);
        $tarp.appendTo($('body'));
        $tarp.on('click', event => {
            event.preventDefault();
            event.stopPropagation();
        });
    }
};

const show = function(cancellable, opacity, zIndex) {

    if (cancellable === undefined)
        cancellable = true;

    if (opacity === undefined)
        opacity = 0;

    init();

    canCancel = cancellable;
    promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
        if (zIndex !== undefined)
            $tarp.css('z-index', zIndex);
        $tarp.one('mousedown', event => {
            if (canCancel) {
                setTimeout(() => $tarp.hide());
                rejectPromise();
            }
        });

        $tarp.show();
    });
    return promise;
};

const hide = function() {
    if ($tarp !== undefined) {
        $tarp.hide();
        $tarp.off('mousedown');
        resolvePromise();
    }
};

module.exports = { init, show, hide };
