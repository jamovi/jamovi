// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import interactionManager from '../../common/interactionmanager';
import { ISvgElementData, Model, View } from '../svg';

const STORED_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="stored"/></svg>';

function makeView(element: Partial<ISvgElementData>, options: Record<string, unknown> = { }) {

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
        options,
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

// jsdom measures every box as zero, so a drag to (x, y) is a box of x by y
function drag(view: View, x: number, y: number) {

    const grip = view.querySelector<HTMLElement>('.jmv-results-svg-grip')!;
    // not implemented by jsdom
    grip.setPointerCapture = () => { };
    grip.releasePointerCapture = () => { };

    grip.dispatchEvent(new MouseEvent('pointerdown',
        { button: 0, clientX: 0, clientY: 0, bubbles: true }));
    grip.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
    grip.dispatchEvent(new MouseEvent('pointerup', { clientX: x, clientY: y }));
}

beforeEach(() => {
    // the module's assets are served from the analysis, and the harvested
    // svg from the instance's resources
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        if (url.startsWith('res/'))
            return { ok: true, text: async () => STORED_SVG };
        return { ok: true, text: async () => '' };
    }));
    vi.stubGlobal('setParam', vi.fn());
    vi.stubGlobal('_', (text: string, values?: Record<string, number>) => {
        if ( ! values)
            return text;
        return text.replace(/\{([^}]+)\}/g, (_, key) => `${ values[key] }`);
    });
    vi.spyOn(interactionManager, 'announce').mockImplementation(() => { });
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
        document.head.querySelector('script')!.dispatchEvent(new Event('error'));
        await view.ready;

        expect(view.querySelector('#stored')).not.toBeNull();
    });

    it('keeps the html when its scripts do load', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
            scripts: [ 'chart.js' ],
            path: '02 an/resources/chart.svg',
        });

        document.head.querySelector('script')!.dispatchEvent(new Event('load'));
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
        document.head.querySelector('script')!.dispatchEvent(new Event('load'));

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

    it('leaves the svg the size the module made it', async () => {
        const view = makeView({
            content: '<svg viewBox="0 0 400 300" width="400" height="300"><rect id="live"/></svg>',
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        expect(svg.style.width).toBe('');
        expect(svg.style.height).toBe('');
        expect(svg.getAttribute('viewBox')).toBe('0 0 400 300');
    });

    it('applies the stored size to the svg', async () => {
        const view = makeView({
            content: '<svg viewBox="0 0 400 300"><rect id="live"/></svg>',
        }, {
            'results//width': 640,
            'results//height': 360,
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        expect(svg.style.width).toBe('640px');
        expect(svg.style.height).toBe('360px');
        // the viewBox is the module's
        expect(svg.getAttribute('viewBox')).toBe('0 0 400 300');
    });

    it('stores the dragged size', async () => {
        const view = makeView({
            content: '<svg viewBox="0 0 400 300"><rect id="live"/></svg>',
        });
        await view.ready;

        // the grip is the result's, not the module's
        const grip = view.querySelector<HTMLElement>('.jmv-results-svg-grip')!;
        expect(grip.parentElement).toBe(view);

        drag(view, 300, 200);

        const svg = view.querySelector<SVGElement>('svg')!;
        expect(svg.style.width).toBe('300px');
        expect(svg.style.height).toBe('200px');
        expect(window.setParam).toHaveBeenCalledWith([ ], { width: 300, height: 200 });
    });

    it('keeps the dragged size when rendered again', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
        });
        await view.ready;

        drag(view, 300, 200);

        view.render();
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        expect(svg.style.width).toBe('300px');
        expect(svg.style.height).toBe('200px');
    });

    it('leaves the markup around the svg alone', async () => {
        const view = makeView({
            content: '<div id="own"><svg><rect id="live"/></svg><p>legend</p></div>',
        }, {
            'results//width': 640,
            'results//height': 360,
        });
        await view.ready;

        const own = view.querySelector<HTMLElement>('#own')!;
        const svg = view.querySelector<SVGElement>('svg')!;
        expect(Array.from(own.children)).toEqual([ svg, own.querySelector('p') ]);
        expect(own.querySelector('.jmv-results-svg-grip')).toBeNull();
        expect(own.style.width).toBe('');
        expect(svg.style.width).toBe('640px');
    });

    it('selects from a press anywhere on the svg', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        const child = view.querySelector<SVGElement>('#live')!;

        child.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.activeElement).toBe(svg);
    });

    it('leaves a press on an interactive part to the module', async () => {
        const view = makeView({
            content: '<svg><g class="jmv-results-svg-interactive"><rect id="live"/></g></svg>',
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        const child = view.querySelector<SVGElement>('#live')!;

        child.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.activeElement).not.toBe(svg);

        // the browser's own focus-on-press is prevented
        const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        child.dispatchEvent(press);
        expect(press.defaultPrevented).toBe(true);

        svg.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.activeElement).toBe(svg);
    });

    it('keeps the selection when a rerun replaces the svg', async () => {
        const view = makeView({
            content: '<svg><rect id="live"/></svg>',
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        svg.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.activeElement).toBe(svg);

        view.render();
        await view.ready;

        const rerun = view.querySelector<SVGElement>('svg')!;
        expect(rerun).not.toBe(svg);
        expect(document.activeElement).toBe(rerun);
    });

    it('applies and stores a size the module asks for', async () => {
        const view = makeView({
            content: '<svg viewBox="0 0 400 300"><rect id="live"/></svg>',
        });
        await view.ready;

        const svg = view.querySelector<SVGElement>('svg')!;
        svg.dispatchEvent(new CustomEvent('jmv-results-svg-resize',
            { bubbles: true, detail: { width: 500, height: 5000 } }));

        // clamped, as a drag is
        expect(svg.style.width).toBe('500px');
        expect(svg.style.height).toBe('2000px');
        expect(window.setParam).toHaveBeenCalledWith([ ], { width: 500, height: 2000 });
    });

    it('leaves a press in a field in an interactive part to the field', async () => {
        const view = makeView({
            content: '<svg><foreignObject class="jmv-results-svg-interactive"><input/></foreignObject></svg>',
        });
        await view.ready;

        const input = view.querySelector<HTMLInputElement>('input')!;
        const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        input.dispatchEvent(press);
        expect(press.defaultPrevented).toBe(false);

        input.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(document.activeElement).not.toBe(view.querySelector('svg'));
    });
});
