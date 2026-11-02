import { h } from '../common/htmlelementcreator';

type Graphic = HTMLElement | SVGElement;
export type ResizeHandleStyle = 'corner' | 'boxes';

// Switch to 'boxes' to enable eight handles for both images and SVGs again.
export const DEFAULT_RESIZE_HANDLE_STYLE: ResizeHandleStyle = 'corner';

interface ResizeHandlesOptions {
    style?: ResizeHandleStyle;
    element(): Graphic | null;
    focus(): void;
    commit(width: number, height: number): void;
    feedback?(width: number, height: number, active: boolean): void;
}

const clamp = (size: number) => Math.min(2000, Math.max(50, size));

// Pointer controls are shared by images and module-rendered SVGs. The Resize
// editor and Ctrl+Arrow remain the keyboard alternatives to these handles.
export function addResizeHandles(owner: HTMLElement, options: ResizeHandlesOptions): void {
    let cancelDrag: (() => void) | null = null;
    const style = options.style ?? DEFAULT_RESIZE_HANDLE_STYLE;
    const corner = getComputedStyle(owner).direction === 'rtl' ? 'sw' : 'se';
    const directions = style === 'boxes' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : [corner];
    for (const direction of directions) {
        const handle = h('div', {
            class: `resize-handle ignore-html${style === 'corner' ? ' resize-corner-grip' : ''}`,
            'data-direction': direction, 'aria-hidden': 'true',
        });
        owner.append(handle);
        handle.addEventListener('pointerdown', (event: PointerEvent) => {
            const element = options.element();
            if (event.button !== 0 || !element) return;
            cancelDrag?.();
            event.preventDefault();
            owner.classList.add('resize-dragging');
            options.focus();
            handle.setPointerCapture(event.pointerId);
            const rect = element.getBoundingClientRect();
            const original = { width: element.style.width, height: element.style.height };
            const x = direction.includes('e') ? 1 : direction.includes('w') ? -1 : 0;
            const y = direction.includes('s') ? 1 : direction.includes('n') ? -1 : 0;
            let width = rect.width;
            let height = rect.height;
            let changed = false;

            const move = (e: PointerEvent) => {
                if (e.pointerId !== event.pointerId) return;
                if (options.element() !== element || !element.isConnected) {
                    finish(false);
                    return;
                }
                width = x ? clamp(rect.width + (e.clientX - event.clientX) * x) : rect.width;
                height = y ? clamp(rect.height + (e.clientY - event.clientY) * y) : rect.height;
                element.style.width = `${width}px`;
                element.style.height = `${height}px`;
                changed = width !== rect.width || height !== rect.height;
                options.feedback?.(width, height, true);
            };
            const finish = (commit: boolean) => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', up);
                handle.removeEventListener('pointercancel', cancel);
                handle.removeEventListener('lostpointercapture', cancel);
                cancelDrag = null;
                owner.classList.remove('resize-dragging');
                if (handle.hasPointerCapture?.(event.pointerId))
                    handle.releasePointerCapture(event.pointerId);
                options.feedback?.(width, height, false);
                if (!commit) {
                    element.style.width = original.width;
                    element.style.height = original.height;
                }
                else if (changed && options.element() === element && element.isConnected)
                    options.commit(Math.round(width), Math.round(height));
            };
            const up = (e: PointerEvent) => {
                if (e.pointerId !== event.pointerId) return;
                finish(true);
            };
            const cancel = () => finish(false);
            cancelDrag = cancel;
            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', up);
            handle.addEventListener('pointercancel', cancel);
            handle.addEventListener('lostpointercapture', cancel);
        });
    }
    owner.addEventListener('keydown', event => {
        if (event.key === 'Escape' && cancelDrag) {
            event.preventDefault();
            event.stopPropagation();
            cancelDrag();
        }
    });
}
