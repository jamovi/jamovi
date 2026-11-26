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

// Handles are placed with CSS anchor positioning (chromium 125+). The macOS and
// linux builds ship electron 25 (chromium 114), which drops the anchor() rules,
// leaving each handle at its static position -- the bottom left of the result.
// There, the handles are placed from script instead. Once every build ships
// electron 31+, this fallback (and --jmv-handle-offset in main.css) can go.
const anchorsSupported = () => typeof CSS !== 'undefined' && CSS.supports?.('anchor-name', '--a') === true;

function placeHandles(owner: HTMLElement, element: Graphic | null): void {
    if (!element || !element.isConnected) return;
    const ownerRect = owner.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(owner).getPropertyValue('--jmv-handle-offset')) || 0;
    const left = rect.left - ownerRect.left - owner.clientLeft;
    const top = rect.top - ownerRect.top - owner.clientTop;
    for (const handle of owner.querySelectorAll<HTMLElement>(':scope > .resize-handle')) {
        const direction = handle.dataset.direction ?? '';
        const x = direction.includes('e') ? rect.width + gap : direction.includes('w') ? -gap : rect.width / 2;
        const y = direction.includes('s') ? rect.height + gap : direction.includes('n') ? -gap : rect.height / 2;
        handle.style.left = `${left + x}px`;
        handle.style.top = `${top + y}px`;
    }
}

// Pointer controls are shared by images and module-rendered SVGs. The Resize
// editor and Ctrl+Arrow remain the keyboard alternatives to these handles.
export function addResizeHandles(owner: HTMLElement, options: ResizeHandlesOptions): void {
    let cancelDrag: (() => void) | null = null;
    const style = options.style ?? DEFAULT_RESIZE_HANDLE_STYLE;
    const corner = getComputedStyle(owner).direction === 'rtl' ? 'sw' : 'se';
    const directions = style === 'boxes' ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] : [corner];

    let place: (() => void) | null = null;
    if ( ! anchorsSupported()) {
        const placeNow = () => placeHandles(owner, options.element());
        place = placeNow;
        // the graphic resizes (and is replaced) while selected, and the
        // result can shift as content around it changes
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(placeNow) : null;
        owner.addEventListener('focusin', () => {
            const element = options.element();
            if (observer) {
                observer.disconnect();
                observer.observe(owner);
                if (element) observer.observe(element);
            }
            placeNow();
        });
    }
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
                if (place) place();
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
