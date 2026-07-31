// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ISvgElementData, Model, View } from '../svg';

const STORED_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="stored"/></svg>';

function makeView(element: Partial<ISvgElementData>) {

    const model = new Model({
        name: 'chart',
        title: '',
        element: {
            content: '',
            scripts: [ ],
            stylesheets: [ ],
            path: '',
            ...element,
        },
        error: null,
        status: 3,
        stale: false,
        options: { },
        refs: [ ],
        refTable: document.createElement('div'),
    } as any);

    const view = new View(model, {
        update: () => true,
        level: 1,
        parent: null,
        mode: 'rich',
        fmt: { },
        devMode: false,
    } as any);

    document.body.append(view);
    return view;
}

beforeEach(() => {
    // the module's assets are served from the analysis, and the harvested
    // svg from the instance's resources
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.startsWith('res/'))
            return { ok: true, text: async () => STORED_SVG };
        return { ok: true, text: async () => '' };
    }));
});

afterEach(() => {
    document.body.replaceChildren();
    document.head.replaceChildren();
    vi.unstubAllGlobals();
});

describe('Svg', () => {

    it('draws the html the analysis provided', async () => {
        const view = makeView({ content: '<svg><rect id="live"/></svg>' });
        await view.ready;

        expect(view.querySelector('#live')).not.toBeNull();
        expect(view.querySelector('#stored')).toBeNull();
    });

    it('falls back to the stored svg when a script cannot be loaded', async () => {
        const view = makeView({
            content: '<div id="chart"></div>',
            scripts: [ 'chart.js' ],
            path: '02 an/resources/chart.svg',
        });

        // the module isn't installed, so its assets 404
        document.head.querySelector('script').dispatchEvent(new Event('error'));
        await view.ready;

        expect(view.querySelector('#stored')).not.toBeNull();
    });

    it('keeps the html when its scripts do load', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
            scripts: [ 'chart.js' ],
            path: '02 an/resources/chart.svg',
        });

        document.head.querySelector('script').dispatchEvent(new Event('load'));
        await view.ready;

        expect(view.querySelector('#live')).not.toBeNull();
        expect(view.querySelector('#stored')).toBeNull();
    });

    it('does not mistake a rendering fault for a missing module', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
            scripts: [ 'chart.js' ],
            path: '02 an/resources/chart.svg',
        });

        (view as any)._runScripts = () => { throw new Error('boom'); };
        document.head.querySelector('script').dispatchEvent(new Event('load'));

        await expect(view.ready).rejects.toThrow('boom');
        expect(view.querySelector('#stored')).toBeNull();
    });

    it('renders the stored svg for files saved without the html', async () => {
        const view = makeView({ content: '', path: '02 an/resources/chart.svg' });
        await view.ready;

        expect(view.querySelector('#stored')).not.toBeNull();
    });

    it('renders nothing when there is neither html nor a stored svg', async () => {
        const view = makeView({ content: '' });
        await view.ready;

        expect(view.querySelector('.content')).toBeNull();
    });
});
