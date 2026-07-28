import { vi } from 'vitest';

import { FocusLoopLifecycle } from '../lifecycle';
import { FocusLoop } from '../focusloop';
import { FocusLoopRegistry } from '../loopregistry';
import type { FocusMode } from '../modecontroller';

export class FakeClassList {
    private values = new Set<string>();

    add(value: string): void {
        this.values.add(value);
    }

    remove(value: string): void {
        this.values.delete(value);
    }

    contains(value: string): boolean {
        return this.values.has(value);
    }
}

export type FakeFocusDispatcher = (element: FakeElement, previous: FakeElement | null) => void;

let focusDispatcher: FakeFocusDispatcher | null = null;
let documentHasFocus = true;
let dispatchDepth = 0;

// A runaway focus loop is the failure this harness exists to catch, so cap the
// nesting and fail loudly instead of overflowing the stack.
const maxDispatchDepth = 20;

/**
 * Makes FakeElement.focus() deliver focusout/focusin the way a browser does:
 * synchronously, before focus() returns. Without this, focus moves made by the
 * lifecycle never re-enter it, and re-entrancy bugs cannot be reproduced.
 */
export function setFocusDispatcher(dispatcher: FakeFocusDispatcher | null): void {
    focusDispatcher = dispatcher;
    dispatchDepth = 0;
}

export function setDocumentHasFocus(value: boolean): void {
    documentHasFocus = value;
}

function currentActiveElement(): FakeElement | null {
    if (typeof document === 'undefined')
        return null;
    return (document.activeElement as unknown as FakeElement) ?? null;
}

export class FakeElement {
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    classList = new FakeClassList();
    attributes = new Map<string, string>();
    listeners = new Map<string, EventListener[]>();
    isConnected = true;
    rendered = true;
    visibility = 'visible';

    constructor(readonly name = 'element') {
    }

    getClientRects(): unknown[] {
        return this.rendered ? [{}] : [];
    }

    append(child: FakeElement): FakeElement {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    contains(element: FakeElement | null): boolean {
        if (!element)
            return false;
        if (element === this)
            return true;
        return this.children.some(child => child.contains(element));
    }

    closest(selector: string): FakeElement | null {
        if (selector !== '.menu-level' && selector !== '.focus-listener')
            return null;

        let element: FakeElement | null = this;
        while (element) {
            if (element.classList.contains(selector.slice(1)))
                return element;
            element = element.parentElement;
        }
        return null;
    }

    focus(): void {
        // Mirrors the browser: an element that is not rendered, is
        // visibility hidden, or is inert cannot take focus, and focus() on it
        // is silently a no-op.
        if (!this.rendered || this.visibility === 'hidden' || this.hasAttribute('inert'))
            return;

        const previous = currentActiveElement();
        if (previous === this)
            return;

        setActiveElement(this);

        if (!focusDispatcher)
            return;

        if (dispatchDepth >= maxDispatchDepth)
            throw new Error(`Focus dispatch nested more than ${maxDispatchDepth} levels deep on "${this.name}"; focus is looping`);

        dispatchDepth++;
        try {
            focusDispatcher(this, previous);
        }
        finally {
            dispatchDepth--;
        }
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    hasAttribute(name: string): boolean {
        return this.attributes.has(name);
    }

    removeAttribute(name: string): void {
        this.attributes.delete(name);
    }

    addEventListener(name: string, listener: EventListener): void {
        const listeners = this.listeners.get(name) ?? [];
        listeners.push(listener);
        this.listeners.set(name, listeners);
    }

    removeEventListener(name: string, listener: EventListener): void {
        this.listeners.set(name, (this.listeners.get(name) ?? []).filter(value => value !== listener));
    }
}

export class FakeSelectElement extends FakeElement {
}

export type LifecycleTestContext = {
    body: FakeElement;
    registry: {
        findLoop: (element: FakeElement) => FocusLoop | undefined;
        unregister: ReturnType<typeof vi.fn>;
        blockInactiveFocus: ReturnType<typeof vi.fn>;
        releaseInactiveFocus: ReturnType<typeof vi.fn>;
        loops: Map<FakeElement, FocusLoop>;
    };
    navigator: {
        keyboardfocusableElements: ReturnType<typeof vi.fn>;
        findFocusableElement: ReturnType<typeof vi.fn>;
    };
    input: {
        lastInputWasPointer: ReturnType<typeof vi.fn>;
        markPointerInput: ReturnType<typeof vi.fn>;
        markKeyboardInput: ReturnType<typeof vi.fn>;
    };
    modes: {
        shouldRestoreDefaultFocusControl: ReturnType<typeof vi.fn>;
        restoreDefaultFocusControl: ReturnType<typeof vi.fn>;
        scheduleDefaultModeReset: ReturnType<typeof vi.fn>;
        inAccessibilityMode: ReturnType<typeof vi.fn>;
        inKeyboardMode: ReturnType<typeof vi.fn>;
        getMode: ReturnType<typeof vi.fn>;
        set: ReturnType<typeof vi.fn>;
        setDefault: ReturnType<typeof vi.fn>;
        getDefaultMode: ReturnType<typeof vi.fn>;
    };
    lifecycle: FocusLoopLifecycle;
};

export function installFakeDom(body = new FakeElement('body')): FakeElement {
    globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
    globalThis.HTMLSelectElement = FakeSelectElement as unknown as typeof HTMLSelectElement;
    setFocusDispatcher(null);
    setDocumentHasFocus(true);
    globalThis.getComputedStyle = ((element: FakeElement) => ({ visibility: element.visibility })) as unknown as typeof globalThis.getComputedStyle;
    globalThis.document = {
        body,
        querySelector: vi.fn(),
        hasFocus: () => documentHasFocus,
    } as unknown as Document;
    setActiveElement(body);
    return body;
}

function composedPathFor(element: FakeElement): EventTarget[] {
    const path: FakeElement[] = [];
    let current: FakeElement | null = element;
    while (current) {
        path.push(current);
        current = current.parentElement;
    }
    return path as unknown as EventTarget[];
}

export function setActiveElement(element: FakeElement): void {
    Object.defineProperty(document, 'activeElement', {
        configurable: true,
        value: element as unknown as Element,
    });
}

export type LifecycleContextOptions = {
    /**
     * Deliver focusout/focusin from FakeElement.focus(), as a browser does.
     * Off by default: most tests drive handleFocusIn() explicitly, and would
     * otherwise see each focus change twice.
     */
    dispatchFocusEvents?: boolean;
};

export function createLifecycleContext(options: LifecycleContextOptions = {}): LifecycleTestContext {
    const body = installFakeDom();
    body.classList.add('menu-level');
    body.setAttribute('fl-level', '0');

    const registry = {
        loops: new Map<FakeElement, FocusLoop>(),
        findLoop(element: FakeElement): FocusLoop | undefined {
            return this.loops.get(element);
        },
        unregister: vi.fn((element: FakeElement): FocusLoop => {
            const loop = registry.loops.get(element);
            if (!loop)
                throw new Error('Element does not have a registered focus loop');
            registry.loops.delete(element);
            return loop;
        }),
        blockInactiveFocus: vi.fn((loop: FocusLoop) => {
            if (loop.inertWhenInactive)
                loop.element.setAttribute('inert', '');
        }),
        releaseInactiveFocus: vi.fn((loop: FocusLoop) => {
            if (loop.inertWhenInactive)
                loop.element.removeAttribute('inert');
        }),
    };

    const navigator = {
        keyboardfocusableElements: vi.fn(() => []),
        findFocusableElement: vi.fn((element: FakeElement) => element.focus()),
    };

    let mode: FocusMode = 'default';
    let defaultMode: FocusMode = 'default';
    const modes = {
        shouldRestoreDefaultFocusControl: vi.fn(() => false),
        restoreDefaultFocusControl: vi.fn(),
        scheduleDefaultModeReset: vi.fn(),
        inAccessibilityMode: vi.fn(() => false),
        inKeyboardMode: vi.fn(() => mode === 'keyboard'),
        getMode: vi.fn(() => mode),
        set: vi.fn((value: FocusMode) => mode = value === 'default' ? defaultMode : value),
        setDefault: vi.fn((value: FocusMode) => defaultMode = value),
        getDefaultMode: vi.fn(() => defaultMode),
    };

    const input = {
        lastInputWasPointer: vi.fn(() => false),
        markPointerInput: vi.fn(),
        markKeyboardInput: vi.fn(),
    };

    const classifier = {
        elementFocusDetails: vi.fn(() => ({ usesKeyboard: true, containsKeyTips: false })),
        containsFocusableMenuLevel: vi.fn(() => true),
    };

    const lifecycle = new FocusLoopLifecycle({
        registry: registry as any,
        input: input as any,
        modes: modes as any,
        navigator: navigator as any,
        classifier: classifier as any,
        isBlurring: () => false,
    });

    if (options.dispatchFocusEvents) {
        setFocusDispatcher((element, previous) => {
            if (previous)
                lifecycle.handleFocusOut({ target: previous, relatedTarget: element } as unknown as FocusEvent);
            lifecycle.handleFocusIn(element as unknown as HTMLElement, composedPathFor(element), previous as unknown as HTMLElement);
        });
    }

    return { body, registry, navigator, input, modes, lifecycle };
}

export function createLoop(ctx: LifecycleTestContext, name: string, options: ConstructorParameters<typeof FocusLoop>[1] = {}, parent = ctx.body): { element: FakeElement, loop: FocusLoop } {
    const element = parent.append(new FakeElement(name));
    element.classList.add('menu-level');
    element.setAttribute('fl-level', (options.level ?? 1).toString());
    const loop = new FocusLoop(element as unknown as HTMLElement, options, options.modal ? ctx.registry.loops.size + 1 : -1, {
        activate: vi.fn(),
        deactivate: vi.fn(),
        unregister: vi.fn(),
    });
    ctx.registry.loops.set(element, loop);
    return { element, loop };
}

export function createLoopRegistry(): FocusLoopRegistry {
    installFakeDom();

    const registry = new FocusLoopRegistry({
        controller: {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        },
        findFocusableElement: vi.fn(),
    });

    registry.setElementHandlers({
        keyDown: vi.fn(),
        mouseMove: vi.fn(),
    });

    return registry;
}
