// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import interactionManager from '../../common/interactionmanager';
import { showResizeDialog } from '../resize';
import { Model as ImageModel, View as ImageView } from '../image';
import { Model as SvgModel, View as SvgView } from '../svg';

beforeEach(() => {
    vi.stubGlobal('_', (text: string) => text);
    vi.stubGlobal('setParam', vi.fn());
    vi.stubGlobal('ResizeObserver', class {
        observe() {} unobserve() {} disconnect() {}
    });
    vi.spyOn(interactionManager, 'announce').mockImplementation(() => {});
    // jsdom does not implement native dialog opening/closing.
    Object.defineProperty(HTMLDialogElement.prototype, 'show', {
        configurable: true, value: function () {
            this.open = true;
            // Native dialog.show() runs the dialog focusing steps.
            (this.querySelector('[autofocus]') ?? this.querySelector('select, input, button'))?.focus();
        },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
        configurable: true, value: function () { this.open = false; },
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(30);
    vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([new DOMRect(0, 0, 400, 300)] as unknown as DOMRectList);
});

afterEach(() => {
    document.querySelector<HTMLButtonElement>('.resize-image-buttons button')?.click();
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function open() {
    const focus = vi.fn();
    const apply = vi.fn();
    const dialog = showResizeDialog({ size: () => ({ width: 400, height: 300 }), apply, focus });
    const [width, height] = Array.from(dialog.querySelectorAll('input'));
    const form = dialog.querySelector<HTMLButtonElement>('.resize-image-apply')!;
    return { dialog, width, height, form, apply, focus };
}

describe('shared resize controls', () => {
    it.each([true, false])('uses explicit context-menu input source (withMouse=%s)', withMouse => {
        interactionManager.setMode('keyboard', { noTransfer: true });
        const dialog = showResizeDialog({
            size: () => ({ width: 400, height: 300 }), apply: vi.fn(), focus: vi.fn(),
        }, document.body, withMouse);
        expect(document.activeElement).toBe(dialog.querySelector('input'));
        if (withMouse)
            expect(['default', 'hover']).toContain(interactionManager.getMode());
        else
            expect(interactionManager.getMode()).toBe('keyboard');
        dialog.querySelector<HTMLButtonElement>('.resize-image-buttons button')!.click();
        interactionManager.setMode('default', { noTransfer: true });
    });

    it('applies with Enter without requesting native form submission', () => {
        const { dialog, width, height, apply } = open();
        expect(dialog.querySelector('form')).toBeNull();
        expect(dialog.querySelector<HTMLButtonElement>('.resize-image-apply')!.type).toBe('button');
        width.value = '640'; height.value = '480';
        const enter = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true });
        width.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(true);
        expect(apply).toHaveBeenCalledExactlyOnceWith(640, 480);
        expect(dialog.isConnected).toBe(false);
    });

    it('labels and focuses the size fields and applies exact dimensions', () => {
        const { dialog, width, height, form, apply, focus } = open();
        expect(dialog.getAttribute('aria-labelledby')).toBe(dialog.querySelector('h2')!.id);
        expect(width.labels![0].textContent).toBe('Width');
        expect(height.labels![0].textContent).toBe('Height');
        expect(width.value).toBe('400');
        expect(height.value).toBe('300');
        expect(document.activeElement).toBe(width);
        width.value = '641';
        height.value = '479';
        form.click();
        expect(apply).toHaveBeenCalledExactlyOnceWith(641, 479);
        expect(dialog.isConnected).toBe(false);
        expect(focus).toHaveBeenCalledOnce();
    });

    it.each(['', '49', '2001', '100.5'])('rejects invalid dimensions (%s)', value => {
        const { dialog, width, form, apply } = open();
        width.value = value;
        form.click();
        expect(apply).not.toHaveBeenCalled();
        expect(dialog.open).toBe(true);
    });

    it.each(['button', 'Escape', 'cancel'])('cancels with %s without applying changes', action => {
        const { dialog, width, apply, focus } = open();
        width.value = '640';
        if (action === 'button') dialog.querySelector<HTMLButtonElement>('button')!.click();
        else if (action === 'Escape') width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
        else dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
        expect(apply).not.toHaveBeenCalled();
        expect(dialog.isConnected).toBe(false);
        expect(focus).toHaveBeenCalledOnce();
    });

    it('keeps arrow keys in the numeric field and traps Tab in the dialog', () => {
        const { dialog, width, height } = open();
        const arrow = new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true });
        width.dispatchEvent(arrow);
        expect(arrow.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(width);
        interactionManager.setMode('keyboard', { noTransfer: true });
        width.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(height);
        const apply = dialog.querySelector<HTMLButtonElement>('.resize-image-apply')!;
        apply.focus();
        apply.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true, cancelable: true }));
        expect(document.activeElement).toBe(dialog.querySelector('select'));
    });

    it.each([['in', '2', '3', 192, 288], ['cm', '2.54', '5.08', 96, 192], ['mm', '25.4', '50.8', 96, 192]])(
        'converts %s dimensions to pixels', (unit, w, h, pixelWidth, pixelHeight) => {
            const { dialog, width, height, form, apply } = open();
            const select = dialog.querySelector('select')!;
            select.value = unit as string;
            select.dispatchEvent(new Event('change'));
            width.value = w as string; height.value = h as string;
            form.click();
            expect(apply).toHaveBeenCalledWith(pixelWidth, pixelHeight);
        });

    it('preserves exact dimensions when switching units without editing', () => {
        const { dialog, width, height, form, apply } = open();
        width.value = '641'; height.value = '479';
        const select = dialog.querySelector('select')!;
        for (const unit of ['in', 'mm', 'cm', 'px']) {
            select.value = unit;
            select.dispatchEvent(new Event('change'));
        }
        expect(width.value).toBe('641');
        expect(height.value).toBe('479');
        form.click();
        expect(apply).toHaveBeenCalledWith(641, 479);
    });

    it('leaves other results usable and dismisses without stealing their focus', () => {
        const container = document.createElement('div');
        const other = document.createElement('button');
        document.body.append(container, other);
        const focus = vi.fn();
        const apply = vi.fn();
        const dialog = showResizeDialog({ size: () => ({ width: 400, height: 300 }), apply, focus }, container);
        expect(dialog.parentElement).toBe(container);
        expect(dialog.getAttribute('aria-modal')).toBe('false');
        expect(interactionManager.getFocusLoop(dialog).modal).toBe(false);
        other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
        other.focus();
        expect(document.activeElement).toBe(other);
        expect(dialog.isConnected).toBe(false);
        expect(focus).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
    });
});

describe('result resize adapters', () => {
    const data = { update: () => true, level: 1, parent: null, mode: 'rich', fmt: {} };

    it('converts image dimensions into the existing scale options', () => {
        const model = new ImageModel({
            name: 'plot', title: 'Plot', refs: [], refTable: document.createElement('div'),
            error: null, status: 3, stale: false, options: {},
            element: { path: '', width: 400, height: 300, widthM: 200, widthB: 20, heightM: 100, heightB: 10 },
        });
        const view = new ImageView(model, data as any);
        document.body.append(view);
        view.getResizeTarget().apply(641, 479);
        expect(window.setParam).toHaveBeenCalledWith([], { widthScale: 3.105, heightScale: 4.69 });
        expect(view.$image.style.width).toBe('641px');
        expect(view.getAttribute('role')).toBe('group');
        expect(view.$image.getAttribute('role')).toBe('img');
        expect(view._menuOptions().some(item => item.name === 'resize')).toBe(true);
    });

    it('opens Set size through the context-menu entry point and persists pixel dimensions', async () => {
        const model = new SvgModel({
            name: 'plot', title: 'Plot', refs: [], refTable: document.createElement('div'),
            error: null, status: 3, stale: false, options: {},
            element: { content: '<svg/>', scripts: [], stylesheets: [], path: '' },
        });
        const view = new SvgView(model, data as any);
        document.body.append(view);
        await view.ready;
        const svg = view.querySelector('svg')!;
        vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
        expect(view.querySelector('.resize-image-button')).toBeNull();
        view.resizeImage(true);
        const dialog = document.querySelector('dialog')!;
        expect(dialog.parentElement).toBe(view);
        const [width, height] = Array.from(dialog.querySelectorAll('input'));
        width.value = '641'; height.value = '479';
        dialog.querySelector<HTMLButtonElement>('.resize-image-apply')!.click();
        expect(window.setParam).toHaveBeenCalledWith([], { width: 641, height: 479 });
        expect(document.activeElement).toBe(svg);
        expect(view.getAttribute('role')).toBe('group');
        expect(view._menuOptions().some(item => item.name === 'resize')).toBe(true);
    });
});
