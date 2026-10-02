'use strict';

// the server can ask for the page to be reloaded, or redirected. a
// relocation is remembered briefly, so it isn't asked for again

const KEY = 'jamovi-relocated';
const WINDOW_MS = 60 * 1000;

export type Relocation = { status: 'reload' } | { status: 'redirect', url: string };

export function recentlyRelocated(): boolean {
    try {
        const at = parseInt(window.sessionStorage.getItem(KEY) ?? '');
        return ! isNaN(at) && Date.now() - at < WINDOW_MS;
    }
    catch (e) {
        return true;  // can't remember, so don't risk a loop
    }
}

export function relocate(relocation: Relocation) {

    try {
        window.sessionStorage.setItem(KEY, Date.now().toString());
    }
    catch (e) { }

    if (relocation.status === 'redirect') {
        const url = new URL(relocation.url);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            throw new Error(`Refusing to relocate to ${ relocation.url }`);
        url.hash = window.location.hash;
        window.location.assign(url.toString());
    }
    else {
        window.location.reload();
    }
}
