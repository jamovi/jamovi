import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createLifecycleContext, createLoop, FakeElement, FakeSelectElement, LifecycleTestContext, setActiveElement } from './helpers';

describe('FocusLoopLifecycle', () => {
    let ctx: LifecycleTestContext;

    beforeEach(() => {
        ctx = createLifecycleContext();
    });

    it('activates a registered loop from focusin', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        const child = element.append(new FakeElement('child'));
        const activated = vi.fn();
        loop.on('activate', activated);

        ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);

        expect(loop.state).toBe('active');
        expect(activated).toHaveBeenCalledOnce();
    });

    it('deactivates a non-modal loop when focus moves outside it', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));
            const outside = ctx.body.append(new FakeElement('outside'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
            vi.advanceTimersByTime(201);
            ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);

            expect(loop.state).toBe('registered');
            expect(deactivated).toHaveBeenCalledOnce();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('does not activate a keyToEnter child loop from passive root focus', () => {
        const parent = createLoop(ctx, 'parent');
        const child = createLoop(ctx, 'child', { keyToEnter: true }, parent.element);
        const parentControl = parent.element.append(new FakeElement('parent-control'));

        ctx.lifecycle.handleFocusIn(parentControl as unknown as HTMLElement, []);
        ctx.lifecycle.handleFocusIn(child.element as unknown as HTMLElement, []);

        expect(parent.loop.state).toBe('active');
        expect(child.loop.state).toBe('registered');
    });

    it('activates a keyToEnter modal and moves to initial focus on explicit activation', () => {
        const { element, loop } = createLoop(ctx, 'modal', { keyToEnter: true, modal: true });
        const first = element.append(new FakeElement('first'));
        ctx.navigator.keyboardfocusableElements.mockReturnValue([first]);
        setActiveElement(element);

        ctx.lifecycle.activate(element as unknown as HTMLElement);

        expect(document.activeElement).toBe(first);
        expect(loop.state).toBe('active');
        expect(ctx.lifecycle.activeModal).toBe(loop);
    });

    it('keeps an active keyToEnter modal active when its root receives focus', () => {
        const { element, loop } = createLoop(ctx, 'modal', { keyToEnter: true, modal: true });
        const child = element.append(new FakeElement('child'));

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        setActiveElement(child);
        ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);

        setActiveElement(element);
        ctx.lifecycle.handleFocusIn(element as unknown as HTMLElement, []);

        expect(loop.state).toBe('active');
        expect(document.activeElement).toBe(child);
        expect(ctx.lifecycle.activeModal).toBe(loop);
    });

    it('traps passive focus outside an active modal', () => {
        const { element, loop } = createLoop(ctx, 'modal', { modal: true });
        const outside = ctx.body.append(new FakeElement('outside'));

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        setActiveElement(outside);
        ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);

        expect(loop.state).toBe('active');
        expect(ctx.navigator.findFocusableElement.mock.calls[0][0]).toBe(element);
        expect(document.activeElement).toBe(element);
    });

    it('keeps the current focused child when explicitly activating its loop', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        const first = element.append(new FakeElement('first'));
        const focused = element.append(new FakeElement('focused'));
        ctx.navigator.keyboardfocusableElements.mockReturnValue([first]);
        setActiveElement(focused);

        ctx.lifecycle.activate(element as unknown as HTMLElement);

        expect(loop.state).toBe('active');
        expect(document.activeElement).toBe(focused);
    });

    it('restores focus to the previous child when an active loop root receives focus', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        const child = element.append(new FakeElement('child'));

        ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);

        setActiveElement(element);
        ctx.lifecycle.handleFocusIn(element as unknown as HTMLElement, [], child as unknown as HTMLElement);

        expect(loop.state).toBe('active');
        expect(document.activeElement).toBe(child);
    });

    it('allows pending modal activation through an existing modal trap', () => {
        const modalA = createLoop(ctx, 'modal-a', { modal: true });
        const modalB = createLoop(ctx, 'modal-b', { modal: true });

        ctx.lifecycle.activate(modalA.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.activate(modalB.element as unknown as HTMLElement, { withMouse: true });

        expect(modalA.loop.state).toBe('active');
        expect(modalB.loop.state).toBe('active');
        expect(ctx.lifecycle.activeModal).toBe(modalB.loop);
    });

    it('restores focus into a newly active loop when focus moves outside during stabilization', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        const child = element.append(new FakeElement('child'));
        const outside = ctx.body.append(new FakeElement('outside'));
        const deactivated = vi.fn();
        loop.on('deactivate', deactivated);

        ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
        setActiveElement(outside);
        ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);

        expect(loop.state).toBe('active');
        expect(document.activeElement).toBe(child);
        expect(deactivated).not.toHaveBeenCalled();
    });

    it('restores focus into a newly active loop when focus moves to null during stabilization', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
            setActiveElement(ctx.body);
            ctx.lifecycle.handleFocusOut({ target: child, relatedTarget: null } as unknown as FocusEvent);

            expect(document.activeElement).toBe(ctx.body);

            vi.advanceTimersByTime(0);

            expect(loop.state).toBe('active');
            expect(document.activeElement).toBe(child);
            expect(deactivated).not.toHaveBeenCalled();
            expect(ctx.modes.scheduleDefaultModeReset).not.toHaveBeenCalled();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('does not restore focus during native select focus transitions', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const select = element.append(new FakeSelectElement('select'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(select as unknown as HTMLElement, []);
            setActiveElement(ctx.body);
            ctx.lifecycle.handleFocusOut({ target: select, relatedTarget: null } as unknown as FocusEvent);
            vi.advanceTimersByTime(0);

            expect(loop.state).toBe('active');
            expect(document.activeElement).toBe(ctx.body);
            expect(deactivated).not.toHaveBeenCalled();
            expect(ctx.modes.scheduleDefaultModeReset).not.toHaveBeenCalled();
            expect(ctx.navigator.findFocusableElement).not.toHaveBeenCalled();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('cancels deferred null focusout handling when focusin arrives', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));
            const outside = ctx.body.append(new FakeElement('outside'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
            vi.advanceTimersByTime(201);
            setActiveElement(outside);
            ctx.lifecycle.handleFocusOut({ target: child, relatedTarget: null } as unknown as FocusEvent);
            ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);
            vi.advanceTimersByTime(0);

            expect(loop.state).toBe('registered');
            expect(deactivated).toHaveBeenCalledOnce();
            expect(ctx.modes.scheduleDefaultModeReset).not.toHaveBeenCalled();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('uses activeElement when no focusin follows a null focusout', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));
            const outside = ctx.body.append(new FakeElement('outside'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
            vi.advanceTimersByTime(201);
            setActiveElement(outside);
            ctx.lifecycle.handleFocusOut({ target: child, relatedTarget: null } as unknown as FocusEvent);
            vi.advanceTimersByTime(0);

            expect(loop.state).toBe('registered');
            expect(deactivated).toHaveBeenCalledOnce();
            expect(ctx.modes.scheduleDefaultModeReset).not.toHaveBeenCalled();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('deactivates normally when focus moves outside after stabilization expires', () => {
        vi.useFakeTimers();
        try {
            const { element, loop } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));
            const outside = ctx.body.append(new FakeElement('outside'));
            const deactivated = vi.fn();
            loop.on('deactivate', deactivated);

            ctx.lifecycle.handleFocusIn(child as unknown as HTMLElement, []);
            vi.advanceTimersByTime(201);
            setActiveElement(outside);
            ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);

            expect(loop.state).toBe('registered');
            expect(deactivated).toHaveBeenCalledOnce();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('restores a suspended modal when the active modal deactivates', () => {
        const modalA = createLoop(ctx, 'modal-a', { modal: true });
        const modalB = createLoop(ctx, 'modal-b', { modal: true });

        ctx.lifecycle.activate(modalA.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.activate(modalB.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.deactivate(modalB.element as unknown as HTMLElement, { source: 'programmatic' });

        expect(modalB.loop.state).toBe('registered');
        expect(modalA.loop.state).toBe('active');
        expect(ctx.lifecycle.activeModal).toBe(modalA.loop);
        expect(document.activeElement).toBe(modalA.element);
    });

    it('keeps a loop active when deactivate is cancelled', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        loop.on('deactivate', event => {
            event.cancel = true;
        });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(result).toBe(false);
        expect(loop.state).toBe('active');
    });

    it('passes focus to an exit selector on programmatic deactivation', () => {
        const exit = ctx.body.append(new FakeElement('exit'));
        exit.setAttribute('tabindex', '0');
        const { element, loop } = createLoop(ctx, 'loop', { exitSelector: exit as unknown as HTMLElement });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(result).toBe(true);
        expect(loop.state).toBe('registered');
        expect(document.activeElement).toBe(exit);
    });

    it('does not pass focus to an exit selector on focus-transfer deactivation', () => {
        const exit = ctx.body.append(new FakeElement('exit'));
        exit.setAttribute('tabindex', '0');
        const { element } = createLoop(ctx, 'loop', { exitSelector: exit as unknown as HTMLElement });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'focus-transfer' });

        expect(result).toBe(false);
        expect(document.activeElement).toBe(element);
    });

    it('runs deactivate handlers on deactivation', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        const close = vi.fn();
        loop.on('deactivate', close);

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(close).toHaveBeenCalledOnce();
        expect(result).toBe(false);
        expect(loop.state).toBe('registered');
    });

    it('refreshes active loop activation options on reactivation', () => {
        const exit = ctx.body.append(new FakeElement('exit'));
        exit.setAttribute('tabindex', '0');
        const { element } = createLoop(ctx, 'loop');
        const activated = vi.fn();
        ctx.registry.findLoop(element)!.on('activate', activated);

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.activate(element as unknown as HTMLElement, {
            withMouse: true,
            exitSelector: exit as unknown as HTMLElement,
            closeFocusMode: 'keyboard',
        });
        ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(activated).toHaveBeenCalledTimes(2);
        expect(document.activeElement).toBe(exit);
        expect(ctx.modes.set).toHaveBeenCalledWith('keyboard');
    });

    it('does not pass focus to an exit selector on mouse deactivation', () => {
        const exit = ctx.body.append(new FakeElement('exit'));
        exit.setAttribute('tabindex', '0');
        const { element } = createLoop(ctx, 'loop', { exitSelector: exit as unknown as HTMLElement });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'mouse' });

        expect(result).toBe(false);
        expect(document.activeElement).toBe(element);
    });

    it('restores a modal initial focus mode when deactivating without focus passing', () => {
        ctx.modes.getMode.mockReturnValue('keyboard');
        const { element } = createLoop(ctx, 'modal', { modal: true });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(ctx.modes.set).toHaveBeenCalledWith('keyboard');
    });

    it('keeps the active modal while focus ownership moves to a contained child loop', () => {
        const modal = createLoop(ctx, 'modal', { modal: true });
        const child = createLoop(ctx, 'child', {}, modal.element);
        const childControl = child.element.append(new FakeElement('child-control'));

        ctx.lifecycle.activate(modal.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.handleFocusIn(childControl as unknown as HTMLElement, []);

        expect(modal.loop.state).toBe('active');
        expect(child.loop.state).toBe('active');
        expect(ctx.lifecycle.activeModal).toBe(modal.loop);
    });

    it('keeps a contained child loop active when the active modal root receives focus', () => {
        const modal = createLoop(ctx, 'modal', { modal: true });
        const child = createLoop(ctx, 'child', {}, modal.element);
        const childControl = child.element.append(new FakeElement('child-control'));
        const childDeactivated = vi.fn();
        child.loop.on('deactivate', childDeactivated);
        ctx.navigator.findFocusableElement.mockImplementation(() => childControl.focus());

        ctx.lifecycle.activate(modal.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.handleFocusIn(childControl as unknown as HTMLElement, []);

        setActiveElement(modal.element);
        ctx.lifecycle.handleFocusIn(modal.element as unknown as HTMLElement, []);

        expect(child.loop.state).toBe('active');
        expect(childDeactivated).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(childControl);
        expect(ctx.lifecycle.activeModal).toBe(modal.loop);
    });

    it('keeps a non-modal parent active while focus ownership moves to a contained child loop', () => {
        const parent = createLoop(ctx, 'parent');
        const child = createLoop(ctx, 'child', {}, parent.element);
        const parentControl = parent.element.append(new FakeElement('parent-control'));
        const childControl = child.element.append(new FakeElement('child-control'));

        ctx.lifecycle.handleFocusIn(parentControl as unknown as HTMLElement, []);
        ctx.lifecycle.handleFocusIn(childControl as unknown as HTMLElement, []);

        expect(parent.loop.state).toBe('active');
        expect(child.loop.state).toBe('active');
    });

    it('deactivates a contained child loop when focus returns to its non-modal parent', () => {
        vi.useFakeTimers();
        try {
            const parent = createLoop(ctx, 'parent');
            const child = createLoop(ctx, 'child', {}, parent.element);
            const parentControl = parent.element.append(new FakeElement('parent-control'));
            const childControl = child.element.append(new FakeElement('child-control'));
            const childDeactivated = vi.fn();
            child.loop.on('deactivate', childDeactivated);

            ctx.lifecycle.handleFocusIn(parentControl as unknown as HTMLElement, []);
            ctx.lifecycle.handleFocusIn(childControl as unknown as HTMLElement, []);
            vi.advanceTimersByTime(201);
            ctx.lifecycle.handleFocusIn(parentControl as unknown as HTMLElement, []);

            expect(parent.loop.state).toBe('active');
            expect(child.loop.state).toBe('registered');
            expect(childDeactivated).toHaveBeenCalledOnce();
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('clears focused loop state when an active loop is removed', () => {
        const { element, loop } = createLoop(ctx, 'loop');

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.remove(element as unknown as HTMLElement);

        expect(loop.state).toBe('removed');
        expect(ctx.registry.findLoop(element)).toBeUndefined();
        expect(() => ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' })).not.toThrow();
        expect(ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' })).toBe(false);
    });

    it('clears active modal state when an active modal is removed', () => {
        const { element, loop } = createLoop(ctx, 'modal', { modal: true });
        const outside = ctx.body.append(new FakeElement('outside'));

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.remove(element as unknown as HTMLElement);
        ctx.lifecycle.handleFocusIn(outside as unknown as HTMLElement, []);

        expect(loop.state).toBe('removed');
        expect(ctx.lifecycle.activeModal).toBeNull();
        expect(ctx.navigator.findFocusableElement).not.toHaveBeenCalled();
    });

    it('clears a disconnected suspended modal when restoring after active modal deactivates', () => {
        const modalA = createLoop(ctx, 'modal-a', { modal: true });
        const modalB = createLoop(ctx, 'modal-b', { modal: true });

        ctx.lifecycle.activate(modalA.element as unknown as HTMLElement, { withMouse: true });
        ctx.lifecycle.activate(modalB.element as unknown as HTMLElement, { withMouse: true });
        modalA.element.isConnected = false;
        ctx.lifecycle.deactivate(modalB.element as unknown as HTMLElement, { source: 'programmatic' });

        expect(modalA.loop.state).toBe('registered');
        expect(ctx.lifecycle.activeModal).toBeNull();
        expect(document.activeElement).toBe(modalB.element);
    });

    it('does not allow mouse deactivation to be cancelled', () => {
        const { element, loop } = createLoop(ctx, 'loop');
        loop.on('deactivate', event => {
            event.cancel = true;
        });

        ctx.lifecycle.activate(element as unknown as HTMLElement, { withMouse: true });
        const result = ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'mouse' });

        expect(result).toBe(false);
        expect(loop.state).toBe('registered');
    });

    it('traps passive focus into another modal without pending activation', () => {
        const modalA = createLoop(ctx, 'modal-a', { modal: true });
        const modalB = createLoop(ctx, 'modal-b', { modal: true });

        ctx.lifecycle.activate(modalA.element as unknown as HTMLElement, { withMouse: true });
        setActiveElement(modalB.element);
        ctx.lifecycle.handleFocusIn(modalB.element as unknown as HTMLElement, []);

        expect(modalA.loop.state).toBe('active');
        expect(modalB.loop.state).toBe('registered');
        expect(ctx.lifecycle.activeModal).toBe(modalA.loop);
        expect(document.activeElement).toBe(modalA.element);
    });

    it('reports active modal key-path availability', () => {
        const blockingModal = createLoop(ctx, 'blocking-modal', { modal: true });
        const allowingModal = createLoop(ctx, 'allowing-modal', { modal: true, allowKeyPaths: true });

        expect(ctx.lifecycle.activeModalAllowsKeyPaths()).toBe(true);

        ctx.lifecycle.activate(blockingModal.element as unknown as HTMLElement, { withMouse: true });
        expect(ctx.lifecycle.activeModalAllowsKeyPaths()).toBe(false);

        ctx.lifecycle.activate(allowingModal.element as unknown as HTMLElement, { withMouse: true });
        expect(ctx.lifecycle.activeModalAllowsKeyPaths()).toBe(true);
    });
});
