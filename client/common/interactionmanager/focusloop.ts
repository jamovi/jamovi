import { EventEmitter } from 'tsee';
import type { FocusMode } from './modecontroller';
import type {
    IFocusLoopActivateOptions,
    IFocusLoopDeactivateOptions,
    FocusLoopController,
    FocusLoopState,
    IFocusLoopOptions,
} from './focustype';

export class FocusLoop extends EventEmitter implements IFocusLoopOptions {
    element: HTMLElement;
    modalId: number;
    level?: number;
    hoverFocus?: boolean;
    exitSelector?: string | WeakRef<HTMLElement> | HTMLElement;
    keyToEnter?: boolean;
    modal?: boolean;
    exitKeys?: string[];
    closeFocusMode?: FocusMode;
    private _initialFocusMode?: FocusMode;
    allowKeyPaths?: boolean;
    needsDeactivate?: boolean;
    state: FocusLoopState = 'registered';
    private readonly controller: FocusLoopController;

    constructor(element: HTMLElement, options: IFocusLoopOptions, modalId: number, controller: FocusLoopController) {
        super();
        this.element = element;
        this.modalId = modalId;
        this.controller = controller;
        Object.assign(this, options);
    }

    get initialFocusMode(): FocusMode | undefined {
        return this._initialFocusMode;
    }

    set initialFocusMode(value: FocusMode | undefined) {
        this._initialFocusMode = value;
    }

    activate(options: IFocusLoopActivateOptions = { withMouse: false }): void {
        this.assertRegistered();
        this.controller.activate(this.element, options);
    }

    deactivate(options: IFocusLoopDeactivateOptions = { source: 'programmatic' }): boolean {
        this.assertRegistered();
        return this.controller.deactivate(this.element, options);
    }

    unregister(): void {
        this.assertRegistered();
        this.controller.unregister(this.element);
    }

    isRegistered(): boolean {
        return this.state !== 'removed';
    }

    private assertRegistered(): void {
        if (this.state === 'removed')
            throw new Error('Cannot use a removed focus loop');
    }
}
