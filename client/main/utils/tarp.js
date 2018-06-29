
'use strict';

const $ = require('jquery');

let $tarps = { };
let $params = { };

const init = function(name) {
    if ($tarps[name] !== undefined)
        return $tarps[name];

    let $tarp = $(`<div style="
            width: 100% ;
            height: 100% ;
            position: absolute ;
            z-index: 99 ;
            top: 0 ;
            left: 0 ;
            background-color: black ;
            display: none ;
            opacity: 0 ;
        "></div>`);
        $tarp.appendTo($('body'));
        $tarp.on('click', event => {
            $tarp.trigger('tarp-clicked');
            event.preventDefault();
            event.stopPropagation();
        });

    $tarps[name] = $tarp;

    return $tarp;
};

const show = function(name, cancellable = true, opacity = 0, zIndex = 99) {

    let $tarp = init(name);

    let params = $params[name];
    if (params === undefined) {
        params = {
            name: name,
            canCancel: true,
            promise: null,
            resolvePromise: null,
            rejectPromise: null,
            opacity: opacity,
            zIndex: zIndex,
            onMouseDown: null
        };

        $params[name] = params;
    }

    params.canCancel = cancellable;

    if (params.promise === null) {
        params.promise = new Promise((resolve, reject) => {
            params.resolvePromise = resolve;
            params.rejectPromise = reject;
            $tarp.css('opacity', params.opacity);
            $tarp.css('z-index', params.zIndex);
            params.onMouseDown =  event => {
                if (params.canCancel) {
                    setTimeout(() => $tarp.hide());
                    params.rejectPromise(event);
                    delete $tarps[params.name];
                    delete $params[params.name];
                    $tarp.remove();
                }
            };
            $tarp.one('mouseup', params.onMouseDown);

            $tarp.show();
        });
    }

    return params.promise;
};

const hide = function(name) {
    let $tarp = $tarps[name];

    if ($tarp !== undefined) {

        let params = $params[name];

        $tarp.off('mouseup');
        $tarp.hide();

        params.resolvePromise();

        delete $tarps[name];
        delete $params[name];

        $tarp.remove();
    }
};

module.exports = { init, show, hide };
