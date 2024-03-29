'use strict';

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

export default { s6e, contextMenuListener }
