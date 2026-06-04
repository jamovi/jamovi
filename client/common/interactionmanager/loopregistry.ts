import { FocusLoop } from './focusloop';
import type { IFocusLoopOptions, FocusLoopController } from './focustype';

export type FocusLoopElementHandlers = {
    keyDown: (event: KeyboardEvent) => Promise<void>;
    mouseMove: (event: MouseEvent) => void;
};

type FocusLoopRegistryDeps = {
    controller: FocusLoopController;
    findFocusableElement: (element: HTMLElement) => void;
};

export class FocusLoopRegistry {
    private availableModalId = 1;
    private readonly controller: FocusLoopController;
    private readonly findFocusableElement: (element: HTMLElement) => void;
    private handlers: FocusLoopElementHandlers | null = null;
    private loops = new WeakMap<HTMLElement, FocusLoop>();
    private modalFocusHandlers = new WeakMap<HTMLElement, EventListener>();

    constructor(deps: FocusLoopRegistryDeps) {
        this.controller = deps.controller;
        this.findFocusableElement = deps.findFocusableElement;
    }

    setElementHandlers(handlers: FocusLoopElementHandlers): void {
        this.handlers = handlers;
    }

    findLoop(element: HTMLElement): FocusLoop | undefined {
        return this.loops.get(element);
    }

    static normalizeExitSelector(selector: string | WeakRef<HTMLElement> | HTMLElement): string | WeakRef<HTMLElement> {
        if (selector instanceof HTMLElement)
            return new WeakRef(selector);
        return selector;
    }

    register(element: HTMLElement, options: IFocusLoopOptions = {}): FocusLoop {
        options = { ...this.optionsFromAttributes(element), ...options };
        options.level = options.level === undefined ? 0 : options.level;
        options.exitKeys = options.exitKeys === undefined ? [] : options.exitKeys;

        let modalId = -1;
        if (options.modal) {
            modalId = this.availableModalId++;
            element.setAttribute('aria-modal', 'true');
            if (!element.hasAttribute('tabindex'))
                element.setAttribute('tabindex', '-1');

            if (!options.keyToEnter) {
                const focusHandler = (event: FocusEvent) => {
                    this.findFocusableElement(element);
                    event.stopPropagation();
                    event.preventDefault();
                };
                element.addEventListener('focus', focusHandler);
                this.modalFocusHandlers.set(element, focusHandler);
            }
        }

        const loop = new FocusLoop(element, options, modalId, this.controller);
        this.loops.set(element, loop);
        this.convertElementExitSelector(loop);

        element.setAttribute('fl-level', loop.level.toString());
        element.classList.add('menu-level');
        if (loop.hoverFocus)
            element.classList.add('hover-focus');

        if (!element.closest('.focus-listener')) {
            const handlers = this.requireElementHandlers();
            element.addEventListener('keydown', handlers.keyDown);
            if (loop.hoverFocus)
                element.addEventListener('mousemove', handlers.mouseMove);
            element.classList.add('focus-listener');
        }

        return loop;
    }

    private optionsFromAttributes(element: HTMLElement): IFocusLoopOptions {
        const options: IFocusLoopOptions = {};
        const level = this.readNumber(element, 'fl-level');
        if (level !== undefined)
            options.level = level;

        this.readBooleanOption(element, options, 'modal', 'fl-modal');
        this.readBooleanOption(element, options, 'keyToEnter', 'fl-keyToEnter');
        this.readBooleanOption(element, options, 'hoverFocus', 'fl-hoverFocus');
        this.readBooleanOption(element, options, 'allowKeyPaths', 'fl-allowKeyPaths');
        this.readBooleanOption(element, options, 'needsDeactivate', 'fl-needsDeactivate');

        const exitSelector = this.readString(element, 'fl-exitSelector');
        if (exitSelector !== undefined)
            options.exitSelector = exitSelector;

        const closeFocusMode = this.readString(element, 'fl-closeFocusMode') as IFocusLoopOptions['closeFocusMode'];
        if (closeFocusMode !== undefined)
            options.closeFocusMode = closeFocusMode;

        if (element.hasAttribute('fl-exitKeys'))
            options.exitKeys = this.readList(element, 'fl-exitKeys');
        return options;
    }

    private readBooleanOption<K extends keyof IFocusLoopOptions>(element: HTMLElement, options: IFocusLoopOptions, option: K, name: string): void {
        const value = this.readBoolean(element, name);
        if (value !== undefined)
            options[option] = value as IFocusLoopOptions[K];
    }

    private readBoolean(element: HTMLElement, name: string): boolean | undefined {
        if (!element.hasAttribute(name))
            return undefined;

        const value = element.getAttribute(name);
        return value === null || value === '' || !['false', '0', 'no', 'off'].includes(value.toLowerCase());
    }

    private readNumber(element: HTMLElement, name: string): number | undefined {
        if (!element.hasAttribute(name))
            return undefined;

        const value = parseInt(element.getAttribute(name), 10);
        return Number.isNaN(value) ? undefined : value;
    }

    private readString(element: HTMLElement, name: string): string | undefined {
        return element.hasAttribute(name) ? element.getAttribute(name) : undefined;
    }

    private readList(element: HTMLElement, name: string): string[] {
        const value = element.getAttribute(name);
        if (!value)
            return [];

        return value.split(/[\s,]+/).filter(item => item.length > 0);
    }

    unregister(element: HTMLElement): FocusLoop {
        const loop = this.loops.get(element);
        if (!loop)
            throw new Error('Element does not have a registered focus loop');

        element.classList.remove('menu-level');
        if (loop.hoverFocus)
            element.classList.remove('hover-focus');

        if (element.classList.contains('focus-listener')) {
            const handlers = this.requireElementHandlers();
            element.classList.remove('focus-listener');
            element.removeEventListener('keydown', handlers.keyDown);
            if (loop.hoverFocus)
                element.removeEventListener('mousemove', handlers.mouseMove);
        }

        const modalFocusHandler = this.modalFocusHandlers.get(element);
        if (modalFocusHandler) {
            element.removeEventListener('focus', modalFocusHandler);
            this.modalFocusHandlers.delete(element);
        }

        this.loops.delete(element);
        return loop;
    }

    private convertElementExitSelector(loop: FocusLoop): void {
        if (loop.exitSelector)
            loop.exitSelector = FocusLoopRegistry.normalizeExitSelector(loop.exitSelector);
    }

    private requireElementHandlers(): FocusLoopElementHandlers {
        if (!this.handlers)
            throw new Error('Focus loop element handlers have not been set');
        return this.handlers;
    }
}
