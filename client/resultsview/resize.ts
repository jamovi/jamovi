import interactionManager from '../common/interactionmanager';
import { h } from '../common/htmlelementcreator';

export interface ResizeTarget {
    size(): { width: number; height: number };
    apply(width: number, height: number): void;
    focus(): void;
}

// The same explicit-size controls serve raster images and module-drawn SVGs.
// Each result keeps its own conversion to persisted results options.
export function showResizeDialog(target: ResizeTarget, container: HTMLElement = document.body, withMouse?: boolean): HTMLDialogElement {
    const existing = document.querySelector<HTMLDialogElement>('dialog.resize-image-dialog');
    if (existing) {
        existing.querySelector('input')?.focus();
        return existing;
    }

    const titleId = interactionManager.nextAriaId('resize-image');
    const dialog = h('dialog', { class: 'resize-image-dialog ignore-html', 'aria-labelledby': titleId, 'aria-modal': 'false' });
    const size = target.size();
    const field = (label: string, value: number) => {
        const input = h('input', { type: 'number', min: '50', max: '2000', step: '1', required: '' });
        input.value = String(Math.round(value));
        // Preserve native numeric editing instead of interpreting arrows as
        // geometric navigation between the dialog's controls.
        input.addEventListener('keydown', event => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key))
                event.stopPropagation();
        });
        return { input, label: h('label', {}, h('span', {}, label), input) };
    };
    const width = field(_('Width'), size.width);
    width.input.autofocus = true;
    const height = field(_('Height'), size.height);
    const factors = { px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 };
    let unit: keyof typeof factors = 'px';
    const units = h('select', { 'aria-label': _('Size unit'), title: _('Size unit') },
        h('option', { value: 'px' }, 'px'),
        h('option', { value: 'in' }, _('in')),
        h('option', { value: 'cm' }, _('cm')),
        h('option', { value: 'mm' }, _('mm')));
    // Keep the pixel values separately so changing units alone never rounds
    // the graphic's size. Only edited fields are converted back to pixels.
    const pixels = { width: Math.round(size.width), height: Math.round(size.height) };
    const displayed = { width: width.input.value, height: height.input.value };
    const readSize = () => {
        for (const [name, input] of [['width', width.input], ['height', height.input]] as const) {
            if (input.value !== displayed[name])
                pixels[name] = input.valueAsNumber * factors[unit];
        }
    };
    const renderSize = () => {
        const factor = factors[unit];
        for (const [name, input, label] of [['width', width.input, _('Width')], ['height', height.input, _('Height')]] as const) {
            const min = Math.ceil(50 / factor * 1000) / 1000;
            const max = Math.floor(2000 / factor * 1000) / 1000;
            input.min = String(min);
            input.max = String(max);
            input.step = unit === 'px' ? '1' : 'any';
            input.setAttribute('aria-label', `${label} (${unit})`);
            input.value = String(Math.max(min, Math.min(max, Number((pixels[name] / factor).toFixed(unit === 'px' ? 0 : 3)))));
            displayed[name] = input.value;
        }
    };
    renderSize();
    const apply = h('button', { type: 'button', class: 'resize-image-apply' }, _('Apply'));
    const cancel = h('button', { type: 'button' }, _('Cancel'));
    // Results frames intentionally disallow native form submission.
    const fields = h('div', { class: 'resize-image-fields' },
        h('div', { class: 'resize-image-header' }, h('h2', { id: titleId }, _('Set size')), units),
        width.label, height.label,
        h('div', { class: 'resize-image-buttons' }, cancel, apply));
    units.addEventListener('change', () => {
        if (!width.input.reportValidity() || !height.input.reportValidity()) {
            units.value = unit;
            return;
        }
        readSize();
        unit = units.value as keyof typeof factors;
        renderSize();
    });
    dialog.append(fields);
    container.append(dialog);
    const parentLevel = Number(container.closest('.menu-level')?.getAttribute('fl-level') ?? 0);
    const loop = interactionManager.registerLoop(dialog, { level: parentLevel + 1, modal: false });
    let closed = false;
    const finish = (restoreFocus = true) => {
        if (closed) return;
        closed = true;
        document.removeEventListener('pointerdown', outsidePress, true);
        observer.disconnect();
        loop.deactivate({ source: 'programmatic' });
        dialog.close();
        loop.unregister();
        dialog.remove();
        if (restoreFocus) target.focus();
    };
    const outsidePress = (event: PointerEvent) => {
        if (event.target instanceof Node && !dialog.contains(event.target))
            finish(false);
    };
    const observer = new MutationObserver(() => {
        if (!dialog.isConnected) finish(false);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('pointerdown', outsidePress, true);
    const applySize = () => {
        if (!width.input.reportValidity() || !height.input.reportValidity()) return;
        readSize();
        const dimension = (value: number) => Math.max(50, Math.min(2000, Math.round(value)));
        target.apply(dimension(pixels.width), dimension(pixels.height));
        finish();
    };
    apply.addEventListener('click', applySize);
    fields.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            event.stopPropagation();
            applySize();
        }
    });
    cancel.addEventListener('click', () => finish());
    dialog.addEventListener('focusout', event => {
        if (event.relatedTarget instanceof Node && !dialog.contains(event.relatedTarget))
            finish(false);
    });
    dialog.addEventListener('cancel', event => {
        event.preventDefault();
        finish();
    });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish();
        }
    }, { capture: true });
    // Context-menu actions cross frames, so their pointer event never reaches
    // this window. Seed activation with the source before show() moves focus.
    if (withMouse !== undefined)
        loop.activate({ withMouse });
    dialog.show();
    width.input.focus();
    width.input.select();
    return dialog;
}
