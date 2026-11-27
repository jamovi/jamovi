// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { addResizeHandles, type ResizeHandleStyle } from '../resizehandles';

afterEach(() => document.body.replaceChildren());

function setup(direction: string, style: ResizeHandleStyle | 'default' = 'boxes', rtl = false) {
    const owner = document.createElement('div');
    owner.style.direction = rtl ? 'rtl' : 'ltr';
    const graphic = document.createElement('div');
    graphic.style.width = '400px'; graphic.style.height = '300px';
    owner.append(graphic);
    document.body.append(owner);
    vi.spyOn(graphic, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
    const commit = vi.fn();
    addResizeHandles(owner, { style: style === 'default' ? undefined : style, element: () => graphic, focus: vi.fn(), commit });
    const handle = owner.querySelector<HTMLElement>(`.resize-handle[data-direction=${direction}]`)!;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = vi.fn();
    const send = (type: string, x = 0, y = 0) => handle.dispatchEvent(new MouseEvent(type, {
        button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
    return { owner, graphic, commit, send };
}

describe('eight resize handles', () => {
    it.each([false, true])('uses one working corner grip by default (RTL=%s)', rtl => {
        const { owner, graphic, commit, send } = setup(rtl ? 'sw' : 'se', 'default', rtl);
        expect(owner.querySelectorAll('.resize-handle')).toHaveLength(1);
        expect(owner.querySelector('.resize-corner-grip')).not.toBeNull();
        send('pointerdown'); send('pointermove', rtl ? -20 : 20, 30); send('pointerup');
        expect(graphic.style.width).toBe('420px');
        expect(graphic.style.height).toBe('330px');
        expect(commit).toHaveBeenCalledExactlyOnceWith(420, 330);
    });

    it.each([
        ['nw', 380, 270], ['n', 400, 270], ['ne', 420, 270], ['e', 420, 300],
        ['se', 420, 330], ['s', 400, 330], ['sw', 380, 330], ['w', 380, 300],
    ])('resizes the correct dimensions from %s', (direction, width, height) => {
        const { owner, graphic, commit, send } = setup(direction as string);
        expect(owner.querySelectorAll('.resize-handle')).toHaveLength(8);
        send('pointerdown');
        send('pointermove', 20, 30);
        expect(graphic.style.width).toBe(`${width}px`);
        expect(graphic.style.height).toBe(`${height}px`);
        expect(commit).not.toHaveBeenCalled();
        send('pointerup', 20, 30);
        expect(commit).toHaveBeenCalledExactlyOnceWith(width, height);
        expect(owner.classList.contains('resize-dragging')).toBe(false);
    });

    it('places the grip at the graphic\'s corner where anchor positioning is unsupported', () => {
        vi.stubGlobal('CSS', { supports: () => false });
        try {
            const { owner, graphic, send } = setup('se', 'default');
            owner.style.setProperty('--jmv-handle-offset', '13px');
            vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(new DOMRect(-10, -40, 800, 400));
            owner.dispatchEvent(new FocusEvent('focusin'));
            const grip = owner.querySelector<HTMLElement>('.resize-handle')!;
            expect(grip.style.left).toBe('423px');
            expect(grip.style.top).toBe('353px');
            send('pointerdown');
            vi.spyOn(graphic, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 420, 330));
            send('pointermove', 20, 30);
            expect(grip.style.left).toBe('443px');
            expect(grip.style.top).toBe('383px');
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('places the size display at the graphic\'s top right where anchor positioning is unsupported', () => {
        vi.stubGlobal('CSS', { supports: () => false });
        try {
            const owner = document.createElement('div');
            const graphic = document.createElement('div');
            const size = document.createElement('div');
            size.className = 'size-display';
            owner.append(graphic, size);
            document.body.append(owner);
            vi.spyOn(owner, 'getBoundingClientRect').mockReturnValue(new DOMRect(-10, -40, 800, 400));
            vi.spyOn(graphic, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 400, 300));
            Object.defineProperty(owner, 'clientWidth', { value: 800 });
            addResizeHandles(owner, { element: () => graphic, focus: vi.fn(), commit: vi.fn() });
            owner.dispatchEvent(new FocusEvent('focusin'));
            expect(size.style.top).toBe('46px');
            expect(size.style.right).toBe('396px');
        }
        finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not cancel the pointerdown, so the drag can leave the iframe', () => {
        const { send } = setup('se');
        expect(send('pointerdown')).toBe(true);
        send('pointerup');
    });

    it('clamps both dimensions', () => {
        const { commit, send } = setup('se');
        send('pointerdown'); send('pointermove', -1000, 3000); send('pointerup');
        expect(commit).toHaveBeenCalledWith(50, 2000);
    });

    it.each(['pointercancel', 'lostpointercapture', 'Escape'])('restores size without saving on %s', reason => {
        const { owner, graphic, commit, send } = setup('nw');
        send('pointerdown'); send('pointermove', 20, 30);
        if (reason === 'Escape')
            owner.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        else send(reason);
        expect(graphic.style.width).toBe('400px');
        expect(graphic.style.height).toBe('300px');
        send('pointerup');
        expect(commit).not.toHaveBeenCalled();
        expect(owner.classList.contains('resize-dragging')).toBe(false);
    });
});
