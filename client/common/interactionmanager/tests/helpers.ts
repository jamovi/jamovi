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

export class FakeElement {
    parentElement: FakeElement | null = null;
    children: FakeElement[] = [];
    classList = new FakeClassList();
    attributes = new Map<string, string>();
    listeners = new Map<string, EventListener[]>();
    isConnected = true;

    constructor(readonly name = 'element') {
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
        setActiveElement(this);
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

    addEventListener(name: string, listener: EventListener): void {
        const listeners = this.listeners.get(name) ?? [];
        listeners.push(listener);
        this.listeners.set(name, listeners);
    }

    removeEventListener(name: string, listener: EventListener): void {
        this.listeners.set(name, (this.listeners.get(name) ?? []).filter(value => value !== listener));
    }
}

export type LifecycleTestContext = {
    body: FakeElement;
    registry: {
        findLoop: (element: FakeElement) => FocusLoop | undefined;
        unregister: ReturnType<typeof vi.fn>;
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
    globalThis.document = {
        body,
        querySelector: vi.fn(),
    } as unknown as Document;
    setActiveElement(body);
    return body;
}

export function setActiveElement(element: FakeElement): void {
    Object.defineProperty(document, 'activeElement', {
        configurable: true,
        value: element as unknown as Element,
    });
}

export function createLifecycleContext(): LifecycleTestContext {
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
