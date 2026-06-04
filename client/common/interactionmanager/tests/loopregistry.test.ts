import { describe, expect, it } from 'vitest';

import { createLoopRegistry, FakeElement } from './helpers';

describe('FocusLoopRegistry', () => {
    it('reads focus loop options from attributes', () => {
        const registry = createLoopRegistry();
        const element = new FakeElement();
        element.setAttribute('fl-level', '2');
        element.setAttribute('fl-modal', '');
        element.setAttribute('fl-keyToEnter', '');
        element.setAttribute('fl-hoverFocus', '');
        element.setAttribute('fl-allowKeyPaths', '');
        element.setAttribute('fl-needsDeactivate', '');
        element.setAttribute('fl-exitSelector', '.exit');
        element.setAttribute('fl-closeFocusMode', 'keyboard');
        element.setAttribute('fl-exitKeys', 'Escape,Alt+ArrowUp');

        const loop = registry.register(element as unknown as HTMLElement);

        expect(loop.level).toBe(2);
        expect(loop.modal).toBe(true);
        expect(loop.keyToEnter).toBe(true);
        expect(loop.hoverFocus).toBe(true);
        expect(loop.allowKeyPaths).toBe(true);
        expect(loop.needsDeactivate).toBe(true);
        expect(loop.exitSelector).toBe('.exit');
        expect(loop.closeFocusMode).toBe('keyboard');
        expect(loop.exitKeys).toEqual(['Escape', 'Alt+ArrowUp']);
    });

    it('lets explicit options override attributes', () => {
        const registry = createLoopRegistry();
        const element = new FakeElement();
        element.setAttribute('fl-level', '2');
        element.setAttribute('fl-modal', '');
        element.setAttribute('fl-keyToEnter', '');
        element.setAttribute('fl-exitKeys', 'Escape');

        const loop = registry.register(element as unknown as HTMLElement, {
            level: 5,
            modal: false,
            keyToEnter: false,
            exitKeys: ['Tab'],
        });

        expect(loop.level).toBe(5);
        expect(element.getAttribute('fl-level')).toBe('5');
        expect(loop.modal).toBe(false);
        expect(loop.keyToEnter).toBe(false);
        expect(loop.exitKeys).toEqual(['Tab']);
    });

    it('removes modal focus redirect handlers on unregister', () => {
        const registry = createLoopRegistry();
        const element = new FakeElement();

        registry.register(element as unknown as HTMLElement, { modal: true });

        expect(element.listeners.get('focus')).toHaveLength(1);

        registry.unregister(element as unknown as HTMLElement);

        expect(element.listeners.get('focus')).toEqual([]);
    });
});
