'use strict';
import { ITextChunk } from './hydrate';

export function s6e(x) {
    return x.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function contextMenuListener(element, callback) {

    element.addEventListener('contextmenu', (event) => {
        return callback(event);
    }); // needed for ipads as well because the results panel simulates contextmenu events

    if (window.navigator.platform.indexOf("Win") === -1) {  // not windows
        element.addEventListener('keydown', (event) => {
            if (event.shiftKey && event.code === 'F10') {  // add shift -> F10 shortcut for context menu
                event.pageX = event.target.offsetLeft + (event.target.offsetWidth / 2);
                event.pageY = event.target.offsetTop + (event.target.offsetHeight / 2);

                let clientRect = event.target.getBoundingClientRect();
                event.clientX = clientRect.left + (clientRect.width / 2);
                event.clientY = clientRect.top  + (clientRect.height / 2);

                const clickEvent = new MouseEvent('contextmenu', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    pageX: event.target.offsetLeft + (event.target.offsetWidth / 2),
                    pageY: event.target.offsetTop + (event.target.offsetHeight / 2),
                    clientX: clientRect.left + (clientRect.width / 2),
                    clientY: clientRect.top  + (clientRect.height / 2),
                    //screenX: event.screenX,
                    //screenY: event.screenY
                });

                event.preventDefault();
                event.stopPropagation();
                callback.call(this, clickEvent);
            }
        });
    }

    if (['iPad Simulator',
        'iPhone Simulator',
        'iPod Simulator',
        'iPad',
        'iPhone',
        'iPod',
    ].includes(navigator.platform)
        // iPad on iOS 13 detection
        || (navigator.userAgent.includes('Mac') && 'ontouchend' in document))
        {
        let rightClickTimeout = null;
        let cancelRightClick = (event) => {
            element.removeEventListener('pointerup', cancelRightClick);
            element.removeEventListener('pointercancel', cancelRightClick);
            element.removeEventListener('pointermove', cancelRightClick);
            if (rightClickTimeout) {
                clearTimeout(rightClickTimeout);
                rightClickTimeout = null;
            }
        };

        element.addEventListener('pointerdown', event => {
            if (event.pointerType === 'mouse')
                return;
            
            element.addEventListener('pointerup', cancelRightClick);
            element.addEventListener('pointercancel', cancelRightClick);
            element.addEventListener('pointermove', cancelRightClick);
            event.stopPropagation();

            rightClickTimeout = setTimeout(() => {
                rightClickTimeout = null;
                cancelRightClick(event);
                callback.call(this, event);
            }, 500);
        });
    }
}

// check whether text chunk has a certain attribute
export function hasAttr(chunk: ITextChunk, attr: string): boolean {
    return ('attributes' in chunk && attr in chunk.attributes);
}

export default { s6e, contextMenuListener }