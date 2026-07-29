// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import { exportElem } from '../utils/formatio';

function svgify(html: string): Promise<string> {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.append(el);
    return exportElem(el, 'image/svg+xml') as unknown as Promise<string>;
}

afterEach(() => {
    document.body.replaceChildren();
    document.head.replaceChildren();
});

describe('exportElem image/svg+xml', () => {

    it('extracts the svg from its surrounding markup', async () => {
        const svg = await svgify('<h2>A title</h2><svg width="60" height="40"><rect/></svg>');

        expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(svg).toContain('<rect');
        expect(svg).not.toContain('A title');
    });

    it('declares the svg namespace, so the markup stands alone', async () => {
        const svg = await svgify('<svg width="60" height="40"></svg>');

        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    });

    it('carries its own dimensions', async () => {
        const svg = await svgify('<svg width="60" height="40"></svg>');

        expect(svg).toContain('width="60"');
        expect(svg).toContain('height="40"');
        expect(svg).toContain('viewBox="0 0 60 40"');
    });

    it('leaves an existing viewBox alone', async () => {
        const svg = await svgify('<svg width="60" height="40" viewBox="0 0 12 8"></svg>');

        expect(svg).toContain('viewBox="0 0 12 8"');
    });

    it('brings the module stylesheets along with it', async () => {
        const ss = document.createElement('style');
        ss.className = 'module-asset';
        ss.textContent = '.bar { fill: red; }';
        document.head.append(ss);

        const svg = await svgify('<svg width="60" height="40"><rect class="bar"/></svg>');

        expect(svg).toContain('.bar { fill: red; }');
        // ahead of the content it styles
        expect(svg.indexOf('.bar { fill: red; }')).toBeLessThan(svg.indexOf('<rect'));
    });

    it('yields nothing when there is no svg to harvest', async () => {
        const svg = await svgify('<div>no chart here</div>');

        expect(svg).toBe('');
    });

    it('is embedded self-contained when surrounding html is exported', async () => {
        const ss = document.createElement('style');
        ss.className = 'module-asset';
        ss.textContent = '.bar { fill: red; }';
        document.head.append(ss);

        const el = document.createElement('section');
        el.innerHTML = '<h2>A title</h2><svg width="60" height="40"><rect class="bar"/></svg>';
        document.body.append(el);

        const html = await (exportElem(el, 'text/html',
            { fragment: true, images: 'absolute', margin: 0, docType: false, dir: 'ltr' } as any) as unknown as Promise<string>);

        // the surrounding results are still html
        expect(html).toContain('<h2');
        expect(html).toContain('A title');
        // but the svg within it stands on its own
        expect(html).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(html).toContain('.bar { fill: red; }');
        expect(html).toContain('viewBox="0 0 60 40"');
        // and isn't duplicated by the verbatim outerHTML it replaced
        expect(html.match(/<rect/g)).toHaveLength(1);
    });

    it('accepts an svg element directly', async () => {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        el.setAttribute('width', '60');
        el.setAttribute('height', '40');
        document.body.append(el);

        const svg = await (exportElem(el, 'image/svg+xml') as unknown as Promise<string>);

        expect(svg).toContain('<svg');
        expect(svg).toContain('width="60"');
    });
});
