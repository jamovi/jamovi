
'use strict';

const $ = require('jquery');

let $tarp;
let canCancel = true;
let promise;
let resolvePromise;
let rejectPromise;

module.exports.show = function(cancellable = true, opacity = 0) {
    canCancel = cancellable;
    promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
        if ($tarp === undefined) {
            $tarp = $(`<div style="
                width: 100% ;
                height: 100% ;
                position: absolute ;
                z-index: 100 ;
                top: 0 ;
                left: 0 ;
                background-color: black ;
                display: none ;
                opacity: 0 ;
            "></div>`);
            $tarp.appendTo($('body'));
        }

        $tarp.css('opacity', opacity);
        $tarp.one('click', event => {
            if (canCancel) {
                $tarp.hide();
                rejectPromise();
            }
        });

        $tarp.show();
    });
    return promise;
};

module.exports.hide = function() {
    if ($tarp !== undefined) {
        $tarp.hide();
        $tarp.off('click');
        resolvePromise();
    }
};
