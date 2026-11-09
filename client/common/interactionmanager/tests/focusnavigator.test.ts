// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FocusNavigator } from '../focusnavigator';

afterEach(() => document.body.replaceChildren());

describe('SVG focus discovery', () => {
    it('includes rendered SVG alongside HTML controls, preserving tab order', () => {
        const root = document.createElement('div');
        root.innerHTML = '<button>Before</button><svg tabindex="0"></svg><button>After</button>';
        document.body.append(root);
        const [before, svg, after] = Array.from(root.children);
        for (const button of [before, after]) {
            Object.defineProperty(button, 'offsetWidth', { value: 100 });
            Object.defineProperty(button, 'offsetHeight', { value: 30 });
        }
        vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 50, 400, 300));
        const navigator = new FocusNavigator();

        expect(navigator.keyboardfocusableElements(root, '0', true)).toEqual([before, svg, after]);
        svg.setAttribute('tabindex', '-1');
        expect(navigator.keyboardfocusableElements(root, '0', true)).toEqual([before, after]);
        expect(navigator.keyboardfocusableElements(root, '0')).toContain(svg);
    });

    it.each(['zero-size', 'hidden', 'inert', 'disabled', 'aria-hidden'])('excludes %s SVG', reason => {
        const root = document.createElement('div');
        root.innerHTML = '<svg tabindex="0"></svg>';
        document.body.append(root);
        const svg = root.firstElementChild!;
        vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(
            new DOMRect(0, 0, reason === 'zero-size' ? 0 : 400, 300));
        if (reason === 'hidden') svg.setAttribute('style', 'visibility: hidden');
        if (reason === 'inert') root.setAttribute('inert', '');
        if (reason === 'disabled') svg.setAttribute('disabled', '');
        if (reason === 'aria-hidden') svg.setAttribute('aria-hidden', 'true');

        expect(new FocusNavigator().keyboardfocusableElements(root, '0')).toEqual([]);
    });
});
