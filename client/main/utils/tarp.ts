
'use strict';

import { HTMLElementCreator as HTML }  from '../../common/htmlelementcreator';

let tarps = { };
let params = { };

const init = function(name) {
    if (tarps[name] !== undefined)
        return tarps[name];

    let body = document.body;

    let tarp = HTML.create('div', {class: 'tarp'});
    body.append(tarp)
    tarp.addEventListener('click', event => {
        let newEvent = new CustomEvent('tarp-clicked', {detail: event});
        tarp.dispatchEvent(newEvent);
        event.preventDefault();
        event.stopPropagation();
    });
    tarp.addEventListener('pointerdown', event => {
        event.preventDefault();
        event.stopPropagation();
    });

    tarps[name] = tarp;

    return tarp;
};

const show = function(name: string, cancellable = true, opacity = 0, zIndex = 99) {

    let tarp = init(name);

    let param = params[name];
    if (param === undefined) {
        param = {
            name: name,
            canCancel: true,
            promise: null,
            resolvePromise: null,
            rejectPromise: null,
            opacity: opacity,
            zIndex: zIndex,
            onMouseDown: null
        };

        params[name] = param;
    }

    param.canCancel = cancellable;

    if (param.promise === null) {
        param.promise = new Promise((resolve, reject) => {
            param.resolvePromise = resolve;
            param.rejectPromise = reject;
            tarp.style.zIndex = param.zIndex;
            param.onMouseDown =  event => {
                if (param.canCancel) {
                    setTimeout(() => tarp.style.display = 'none' );
                    param.rejectPromise(event);
                    delete tarps[param.name];
                    delete params[param.name];
                    tarp.remove();
                }
                event.preventDefault();
                event.stopPropagation();
            };
            tarp.addEventListener('pointerup', param.onMouseDown, { once: true });

            tarp.style.display = 'inherit';
        });
    }

    return param.promise;
};

const hide = function(name) {
    let tarp = tarps[name];

    if (tarp !== undefined) {

        let param = params[name];

        tarp.style.display = 'none'

        param.resolvePromise();

        delete tarps[name];
        delete params[name];

        tarp.remove();
    }
};

module.exports = { init, show, hide };
