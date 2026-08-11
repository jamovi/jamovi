import { describe, expect, it, vi } from 'vitest';

import { createLifecycleContext, createLoop, FakeElement, setActiveElement, setDocumentHasFocus } from './helpers';

// These tests run with dispatchFocusEvents enabled, so every focus() the
// lifecycle makes re-enters handleFocusIn synchronously, as it does in a
// browser. They cover the paths that explicit handleFocusIn() calls cannot
// reach: focus moves the lifecycle makes itself, and the nesting they cause.
describe('FocusLoopLifecycle with browser focus events', () => {

    it('activates a loop once when activation moves focus into it', () => {
        const ctx = createLifecycleContext({ dispatchFocusEvents: true });
        const { element, loop } = createLoop(ctx, 'loop');
        const first = element.append(new FakeElement('first'));
        const activated = vi.fn();
        loop.on('activate', activated);
        ctx.navigator.keyboardfocusableElements.mockReturnValue([first]);

        ctx.lifecycle.activate(element as unknown as HTMLElement);

        expect(document.activeElement).toBe(first);
        expect(loop.state).toBe('active');
        expect(activated).toHaveBeenCalledOnce();
    });

    it('restores focus into the modal when focus escapes to an outside element', () => {
        vi.useFakeTimers();
        try {
            const ctx = createLifecycleContext({ dispatchFocusEvents: true });
            const modal = createLoop(ctx, 'modal', { modal: true });
            const inside = modal.element.append(new FakeElement('inside'));
            const outside = ctx.body.append(new FakeElement('outside'));

            ctx.lifecycle.activate(modal.element as unknown as HTMLElement, { withMouse: true });
            inside.focus();
            vi.advanceTimersByTime(201);

            outside.focus();

            expect(document.activeElement).toBe(inside);
            expect(modal.loop.state).toBe('active');
            expect(ctx.lifecycle.activeModal).toBe(modal.loop);
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('does not strand a loop that a deactivate handler focuses into', () => {
        vi.useFakeTimers();
        try {
            const ctx = createLifecycleContext({ dispatchFocusEvents: true });
            const first = createLoop(ctx, 'first');
            const second = createLoop(ctx, 'second');
            const third = createLoop(ctx, 'third');
            const firstChild = first.element.append(new FakeElement('first-child'));
            const secondChild = second.element.append(new FakeElement('second-child'));
            const thirdChild = third.element.append(new FakeElement('third-child'));

            firstChild.focus();
            vi.advanceTimersByTime(201);
            first.loop.on('deactivate', () => {
                thirdChild.focus();
            });

            secondChild.focus();

            expect(first.loop.state).toBe('registered');
            expect(second.loop.state).toBe('active');
            expect(third.loop.state).toBe('registered');
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('deactivates the previous loop when focus moves to a sibling loop', () => {
        vi.useFakeTimers();
        try {
            const ctx = createLifecycleContext({ dispatchFocusEvents: true });
            const first = createLoop(ctx, 'first');
            const second = createLoop(ctx, 'second');
            const firstChild = first.element.append(new FakeElement('first-child'));
            const secondChild = second.element.append(new FakeElement('second-child'));

            firstChild.focus();
            vi.advanceTimersByTime(201);
            secondChild.focus();

            expect(first.loop.state).toBe('registered');
            expect(second.loop.state).toBe('active');
            expect(document.activeElement).toBe(secondChild);
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('passes focus to an exit selector without re-entering activation', () => {
        const ctx = createLifecycleContext({ dispatchFocusEvents: true });
        const opener = ctx.body.append(new FakeElement('opener'));
        opener.setAttribute('tabindex', '0');
        const { element, loop } = createLoop(ctx, 'loop', { exitSelector: opener as unknown as HTMLElement });
        const child = element.append(new FakeElement('child'));

        child.focus();
        ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(loop.state).toBe('registered');
        expect(document.activeElement).toBe(opener);
    });

    it('enters keyboard mode when focus passes back to the opener after a keyboard-driven close', () => {
        const ctx = createLifecycleContext({ dispatchFocusEvents: true });
        const opener = ctx.body.append(new FakeElement('opener'));
        opener.setAttribute('tabindex', '0');
        const { element } = createLoop(ctx, 'loop', { exitSelector: opener as unknown as HTMLElement });
        const child = element.append(new FakeElement('child'));

        ctx.input.lastInputWasPointer.mockReturnValue(true);
        child.focus();

        // Mirrors handleKeyPress marking keyboard input before Escape closes the loop.
        ctx.input.lastInputWasPointer.mockReturnValue(false);
        ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(document.activeElement).toBe(opener);
        expect(ctx.modes.getMode()).toBe('keyboard');
    });

    it('stays out of keyboard mode when focus passes back to the opener after a mouse-driven close', () => {
        const ctx = createLifecycleContext({ dispatchFocusEvents: true });
        const opener = ctx.body.append(new FakeElement('opener'));
        opener.setAttribute('tabindex', '0');
        const { element } = createLoop(ctx, 'loop', { exitSelector: opener as unknown as HTMLElement });
        const child = element.append(new FakeElement('child'));

        ctx.input.lastInputWasPointer.mockReturnValue(true);
        child.focus();

        ctx.lifecycle.deactivate(element as unknown as HTMLElement, { source: 'programmatic' });

        expect(document.activeElement).toBe(opener);
        expect(ctx.modes.getMode()).toBe('hover');
    });

    it('restores a stabilizing loop when focus goes nowhere and the document has focus', () => {
        vi.useFakeTimers();
        try {
            const ctx = createLifecycleContext({ dispatchFocusEvents: true });
            const { element } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));

            child.focus();
            setActiveElement(ctx.body);

            ctx.lifecycle.handleFocusOut({ target: child, relatedTarget: null } as unknown as FocusEvent);
            vi.advanceTimersByTime(1);

            expect(document.activeElement).toBe(child);
        }
        finally {
            vi.useRealTimers();
        }
    });

    it('leaves focus alone when it goes nowhere and the document has no focus', () => {
        vi.useFakeTimers();
        try {
            const ctx = createLifecycleContext({ dispatchFocusEvents: true });
            const { element } = createLoop(ctx, 'loop');
            const child = element.append(new FakeElement('child'));

            child.focus();
            setActiveElement(ctx.body);
            setDocumentHasFocus(false);

            ctx.lifecycle.handleFocusOut({ target: child, relatedTarget: null } as unknown as FocusEvent);
            vi.advanceTimersByTime(1);

            expect(document.activeElement).toBe(ctx.body);
            expect(ctx.modes.scheduleDefaultModeReset).not.toHaveBeenCalled();
        }
        finally {
            vi.useRealTimers();
        }
    });
});
