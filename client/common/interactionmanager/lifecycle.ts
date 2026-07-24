import type { FocusElementClassifier } from './classifier';
import { FocusPassController } from './focuspass';
import type { FocusInputTracker } from './input';
import type { FocusNavigator } from './focusnavigator';
import type { FocusMode, FocusModeController } from './modecontroller';
import type { FocusLoopActivationOptions, FocusLoopDeactivateResult, FocusLoop, FocusLoopState, IFocusLoopActivateOptions, IFocusLoopDeactivateEvent, IFocusLoopDeactivateOptions } from './focustype';
import { FocusLoopRegistry } from './loopregistry';

type FocusLoopLifecycleDeps = {
    registry: FocusLoopRegistry;
    input: FocusInputTracker;
    modes: FocusModeController;
    navigator: FocusNavigator;
    classifier: FocusElementClassifier;
    isBlurring: () => boolean;
};

type PendingUnknownFocusOut = {
    target: EventTarget | null;
    sourceLoop: FocusLoop | null;
    fromNativeSelect: boolean;
};

const allowedLoopStateTransitions: { [state in FocusLoopState]: FocusLoopState[] } = {
    registered: ['activating', 'removed'],
    activating: ['active', 'registered'],
    active: ['deactivating', 'removed'],
    deactivating: ['active', 'registered'],
    removed: [],
};

const activationStabilizeMs = 200;

export class FocusLoopLifecycle {
    private readonly registry: FocusLoopRegistry;
    private readonly input: FocusInputTracker;
    private readonly modes: FocusModeController;
    private readonly navigator: FocusNavigator;
    private readonly classifier: FocusElementClassifier;
    private readonly isBlurring: () => boolean;
    private activeActivationOptions = new WeakMap<FocusLoop, FocusLoopActivationOptions>();
    private activeModalLoop: FocusLoop | null = null;
    private focusedLoop: FocusLoop | null = null;
    private activatingLoop: FocusLoop | null = null;
    private pendingActivations = new WeakMap<FocusLoop, IFocusLoopActivateOptions>();
    private activationStabilizers = new WeakMap<FocusLoop, ReturnType<typeof setTimeout>>();
    private pendingUnknownFocusOut: PendingUnknownFocusOut | null = null;
    private pendingUnknownFocusOutTimer: ReturnType<typeof setTimeout> | null = null;
    private focusedElements = new WeakMap<FocusLoop, HTMLElement>();
    private focusPass = new FocusPassController();
    private pausedFocusControl: HTMLElement | null = null;
    private modalChain: FocusLoop[] = [];

    constructor(deps: FocusLoopLifecycleDeps) {
        this.registry = deps.registry;
        this.input = deps.input;
        this.modes = deps.modes;
        this.navigator = deps.navigator;
        this.classifier = deps.classifier;
        this.isBlurring = deps.isBlurring;
    }

    get activeModal(): FocusLoop | null {
        return this.activeModalLoop;
    }

    get activeModalElement(): HTMLElement | null {
        return this.activeModalLoop ? this.activeModalLoop.element : null;
    }

    activeModalAllowsKeyPaths(): boolean {
        return !this.activeModalLoop || this.activeModalLoop.state !== 'active' || !!this.activeModalLoop.allowKeyPaths;
    }

    hasActivatingLoopInside(element: HTMLElement): boolean {
        return this.activatingLoop !== null && element.contains(this.activatingLoop.element);
    }

    pauseFocusRestore(element: HTMLElement): void {
        this.pausedFocusControl = element;
    }

    resumeFocusRestore(): void {
        this.pausedFocusControl = null;
    }

    handleFocusOut(event: FocusEvent): void {
        const pausedFocusControl = this.getPausedFocusControl();
        if (pausedFocusControl) {
            if (event.relatedTarget !== pausedFocusControl)
                pausedFocusControl.focus();
            return;
        }

        if (this.focusPass.isPassing() || this.isBlurring())
            return;

        if (event.relatedTarget === null) {
            this.deferUnknownFocusOut(event);
            return;
        }

        this.resolveFocusOut(event.target, event.relatedTarget);
    }

    private resolveFocusOut(target: EventTarget | null, relatedTarget: EventTarget | null): void {
        if (this.modes.shouldRestoreDefaultFocusControl(target, relatedTarget))
            this.modes.restoreDefaultFocusControl();
    }

    private deferUnknownFocusOut(event: FocusEvent): void {
        this.clearPendingUnknownFocusOut();
        this.pendingUnknownFocusOut = {
            target: event.target,
            sourceLoop: this.focusedLoop,
            fromNativeSelect: this.isNativeSelectFocusTransition(event),
        };
        this.pendingUnknownFocusOutTimer = setTimeout(() => {
            this.resolvePendingUnknownFocusOut();
        }, 0);
    }

    private resolvePendingUnknownFocusOut(): void {
        const pending = this.pendingUnknownFocusOut;
        this.clearPendingUnknownFocusOut();
        if (!pending)
            return;

        if (typeof document.hasFocus === 'function' && !document.hasFocus())
            return;

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && activeElement !== document.body) {
            if (pending.sourceLoop && pending.sourceLoop.element.contains(activeElement))
                return;

            if (this.activeModalElement) {
                this.navigator.findFocusableElement(this.activeModalElement);
                return;
            }

            this.resolveFocusOut(pending.target, activeElement);
            this.deactivateFocusedLoopIfFocusMovedOutside(activeElement);
            return;
        }

        if (pending.fromNativeSelect)
            return;

        if (this.restoreStabilizingFocusedLoop())
            return;

        if (this.activeModalElement) {
            this.navigator.findFocusableElement(this.activeModalElement);
            return;
        }

        if (this.modes.getMode() !== 'keyTips')
            this.modes.scheduleDefaultModeReset();
    }

    private clearPendingUnknownFocusOut(): void {
        if (this.pendingUnknownFocusOutTimer) {
            clearTimeout(this.pendingUnknownFocusOutTimer);
            this.pendingUnknownFocusOutTimer = null;
        }
        this.pendingUnknownFocusOut = null;
    }

    private clearPendingUnknownFocusOutIf(loop: FocusLoop): void {
        if (this.pendingUnknownFocusOut?.sourceLoop === loop)
            this.clearPendingUnknownFocusOut();
    }

    handleFocusIn(element: HTMLElement, composedPath: EventTarget[], relatedTarget: HTMLElement | null = null): void {
        this.clearPendingUnknownFocusOut();

        const pausedFocusControl = this.getPausedFocusControl();
        if (pausedFocusControl) {
            if (element !== pausedFocusControl)
                pausedFocusControl.focus();
            return;
        }

        const loopElement = this.findRegisteredLoopElementForFocus(element);

        if (this.shouldRestoreStabilizingFocusedLoopFor(element)) {
            this.restoreFocusIntoLoop(this.focusedLoop!);
            return;
        }

        if (this.activeModalElement && !this.activeModalElement.contains(element) && !this.isPendingModalActivation(loopElement)) {
            this.navigator.findFocusableElement(this.activeModalElement);
            return;
        }

        if (loopElement)
            this.commitFocusedLoop(loopElement, element, relatedTarget);
        else
            this.deactivateFocusedLoopIfFocusMovedOutside(element);

        if (element === document.body) {
            this.modes.set('default');
        }
        else if (element !== null && !element.classList.contains('temp-focus-cell')) {
            if (this.focusPass.isTarget(element)) {
                this.focusPass.clear();
            }
            else if (!this.modes.inAccessibilityMode()) {
                const details = this.classifier.elementFocusDetails(element);
                const fromPointer = this.input.lastInputWasPointer();
                if (details.usesKeyboard || this.classifier.containsFocusableMenuLevel(composedPath) || (this.modes.inKeyboardMode() && !fromPointer)) {
                    const keyboardMode = !element.classList.contains('menu-level') && !fromPointer ? 'keyboard' : 'hover';
                    this.modes.set(keyboardMode);
                }
                else {
                    this.modes.set('default');
                }
            }
            else if (this.modes.getMode() === 'keyTips') {
                const details = this.classifier.elementFocusDetails(element);
                if (!details.containsKeyTips)
                    this.modes.set('accessible');
            }
        }
        else if (this.modes.getMode() !== this.modes.getDefaultMode()) {
            this.modes.set('default');
        }

        this.input.markKeyboardInput();
    }

    reconcilePointerDown(element: Element): void {
        if (this.modes.inAccessibilityMode()) {
            setTimeout(() => {
                const info = this.classifier.elementFocusDetails(element);
                this.modes.set(info.usesKeyboard ? 'hover' : 'default');
            }, 0);
        }
    }

    reconcilePointerMove(): void {
        if (this.modes.getMode() === 'keyboard')
            this.modes.set('hover', { noTransfer: true, silent: false });
    }

    private findRegisteredLoopElementForFocus(element: HTMLElement): HTMLElement | null {
        if (!element)
            return null;

        if (this.registry.findLoop(element))
            return element;

        let loopElement: HTMLElement | null = element.closest('.menu-level') as HTMLElement;
        while (loopElement) {
            if (this.registry.findLoop(loopElement))
                return loopElement;

            loopElement = loopElement.parentElement ? loopElement.parentElement.closest('.menu-level') as HTMLElement : null;
        }

        return null;
    }

    private isNativeSelectFocusTransition(event: FocusEvent): boolean {
        return event.target instanceof HTMLSelectElement && event.relatedTarget === null;
    }

    private isPendingModalActivation(loopElement: HTMLElement | null): boolean {
        if (!loopElement)
            return false;

        const loop = this.registry.findLoop(loopElement);
        return !!loop && !!loop.modal && this.pendingActivations.has(loop);
    }

    private shouldRestoreStabilizingFocusedLoopFor(element: HTMLElement): boolean {
        const loop = this.focusedLoop;
        if (!loop || loop.state !== 'active' || !this.isStabilizing(loop))
            return false;

        return !loop.element.contains(element);
    }

    private restoreStabilizingFocusedLoop(): boolean {
        const loop = this.focusedLoop;
        if (!loop || loop.state !== 'active' || !this.isStabilizing(loop))
            return false;

        if (typeof document.hasFocus === 'function' && !document.hasFocus())
            return false;

        this.restoreFocusIntoLoop(loop);
        return true;
    }

    private restoreFocusIntoLoop(loop: FocusLoop): void {
        const target = this.findFocusRestoreTarget(loop, null);
        if (target)
            target.focus();
        else
            this.navigator.findFocusableElement(loop.element);
    }

    private isStabilizing(loop: FocusLoop): boolean {
        return this.activationStabilizers.has(loop);
    }

    private startActivationStabilizer(loop: FocusLoop): void {
        this.clearActivationStabilizer(loop);
        const timer = setTimeout(() => {
            this.activationStabilizers.delete(loop);
        }, activationStabilizeMs);
        this.activationStabilizers.set(loop, timer);
    }

    private clearActivationStabilizer(loop: FocusLoop): void {
        const timer = this.activationStabilizers.get(loop);
        if (timer)
            clearTimeout(timer);
        this.activationStabilizers.delete(loop);
    }

    private deactivateFocusedLoopIfFocusMovedOutside(element: HTMLElement): void {
        const loop = this.focusedLoop;
        if (!loop || loop.state !== 'active' || loop.modal)
            return;

        if (loop.element.contains(element))
            return;

        this.deactivate(loop.element, this.focusTransferDeactivateOptions());
    }

    remove(element: HTMLElement): void {
        const loop = this.registry.unregister(element);
        this.setLoopState(loop, 'removed');
        this.clearActiveModalIf(loop);
        this.clearFocusedLoopIf(loop);
        this.clearActiveActivationOptions(loop);
        this.clearFocusedElement(loop);
        this.clearActivationStabilizer(loop);
        this.clearPendingUnknownFocusOutIf(loop);
        this.assertLifecycleState('remove');
    }

    activate(loopElement: HTMLElement, options: IFocusLoopActivateOptions = { withMouse: false }): void {
        if (options.withMouse)
            this.input.markPointerInput();
        else
            this.input.markKeyboardInput();

        const loop = this.registry.findLoop(loopElement);
        if (!loop)
            throw new Error('Element does not have a registered focus loop');

        this.pendingActivations.set(loop, options);

        if (loop.state === 'active') {
            this.refreshActiveLoopActivation(loop, loopElement, options);
            this.pendingActivations.delete(loop);
            this.assertLifecycleState('activate-active');
            return;
        }

        try {
            this.setActivatingLoop(loop);
            if (loop.state === 'registered')
                this.setLoopState(loop, 'activating');

            if (this.shouldCommitCurrentFocusOnActivate(loop, loopElement))
                this.commitFocusedLoop(loopElement, document.activeElement as HTMLElement);
            else {
                this.focusActivatedLoop(loopElement, options);
                if (loopElement.contains(document.activeElement))
                    this.commitFocusedLoop(loopElement, document.activeElement as HTMLElement);
            }

            if (loop.state === 'activating') {
                this.pendingActivations.delete(loop);
                this.setLoopState(loop, 'registered');
            }
        }
        finally {
            this.clearActivatingLoop();
        }
        this.assertLifecycleState('activate-request');
    }

    private shouldCommitCurrentFocusOnActivate(loop: FocusLoop, loopElement: HTMLElement): boolean {
        if (!loopElement.contains(document.activeElement))
            return false;

        return !(loop.keyToEnter && document.activeElement === loopElement);
    }

    deactivate(loopElement: HTMLElement, options: IFocusLoopDeactivateOptions = { source: 'programmatic' }): boolean {
        const result = this.deactivateDetailed(loopElement, options);
        if (!result.deactivated)
            return false;
        this.assertLifecycleState('deactivate');
        return result.exitElementFound;
    }

    private setActiveModal(loop: FocusLoop): void {
        this.activeModalLoop = loop;
    }

    private clearActiveModal(): void {
        this.activeModalLoop = null;
    }

    private clearActiveModalIf(loop: FocusLoop): void {
        if (this.activeModalLoop === loop)
            this.clearActiveModal();
    }

    private setFocusedLoop(loop: FocusLoop | null): void {
        this.focusedLoop = loop;
    }

    private clearFocusedLoop(): void {
        this.focusedLoop = null;
    }

    private clearFocusedLoopIf(loop: FocusLoop): void {
        if (this.focusedLoop === loop)
            this.clearFocusedLoop();
    }

    private setFocusedElement(loop: FocusLoop, element: HTMLElement): void {
        if (element && element !== loop.element && loop.element.contains(element))
            this.focusedElements.set(loop, element);
    }

    private clearFocusedElement(loop: FocusLoop): void {
        this.focusedElements.delete(loop);
    }

    private setActivatingLoop(loop: FocusLoop | null): void {
        this.activatingLoop = loop;
    }

    private clearActivatingLoop(): void {
        this.activatingLoop = null;
    }

    private commitFocusedLoop(loopElement: HTMLElement, focusedElement: HTMLElement = document.activeElement as HTMLElement, relatedTarget: HTMLElement | null = null): void {
        const loop = this.registry.findLoop(loopElement);
        if (!loop)
            return;

        if (loop.state === 'active') {
            if (this.restoreFocusForActiveRoot(loop, focusedElement, relatedTarget))
                return;
            if (this.focusedLoop !== loop)
                this.focusLoop(loop);
            this.setFocusedElement(loop, focusedElement);
            return;
        }

        if (loop.keyToEnter && focusedElement === loopElement && !this.pendingActivations.has(loop)) {
            const parentLoop = loopElement.parentElement ? loopElement.parentElement.closest('.menu-level') as HTMLElement : null;
            if (parentLoop) {
                this.commitFocusedLoop(parentLoop, focusedElement);
                return;
            }
        }

        if (loop.state !== 'registered' && loop.state !== 'activating')
            return;

        const options = this.pendingActivations.get(loop) ?? { withMouse: this.input.lastInputWasPointer() };

        try {
            this.setActivatingLoop(loop);
            if (loop.state === 'registered')
                this.setLoopState(loop, 'activating');

            this.focusLoop(loop);
            this.setLoopState(loop, 'active');
            this.setFocusedElement(loop, focusedElement);

            if (loop.modal)
                this.activateModal(loop);

            this.setActiveActivationOptions(loop, options);
            this.pendingActivations.delete(loop);
            this.startActivationStabilizer(loop);
            loop.emit('activate');
        }
        finally {
            this.clearActivatingLoop();
        }

        this.assertLifecycleState('focusin-activate');
    }

    private restoreFocusForActiveRoot(loop: FocusLoop, focusedElement: HTMLElement, relatedTarget: HTMLElement | null): boolean {
        if (focusedElement !== loop.element || this.pendingActivations.has(loop))
            return false;

        const focused = this.focusedLoop;
        if (focused && focused !== loop && loop.element.contains(focused.element)) {
            const target = this.findFocusRestoreTarget(focused, relatedTarget);
            if (target)
                target.focus();
            else
                this.navigator.findFocusableElement(focused.element);
            return true;
        }

        const target = this.findFocusRestoreTarget(loop, relatedTarget);
        if (!target)
            return false;

        target.focus();
        return true;
    }

    private findFocusRestoreTarget(loop: FocusLoop, relatedTarget: HTMLElement | null): HTMLElement | null {
        if (relatedTarget && relatedTarget !== loop.element && loop.element.contains(relatedTarget))
            return relatedTarget;

        const focusedElement = this.focusedElements.get(loop);
        if (focusedElement && focusedElement !== loop.element && focusedElement.isConnected && loop.element.contains(focusedElement))
            return focusedElement;

        return null;
    }

    private getPausedFocusControl(): HTMLElement | null {
        return this.pausedFocusControl;
    }

    private setActiveActivationOptions(loop: FocusLoop, options: IFocusLoopActivateOptions): void {
        const activationOptions: FocusLoopActivationOptions = {};
        if (options.closeFocusMode)
            activationOptions.closeFocusMode = options.closeFocusMode;
        if (options.exitSelector)
            activationOptions.exitSelector = FocusLoopRegistry.normalizeExitSelector(options.exitSelector);

        if (activationOptions.closeFocusMode || activationOptions.exitSelector)
            this.activeActivationOptions.set(loop, activationOptions);
        else
            this.clearActiveActivationOptions(loop);
    }

    private clearActiveActivationOptions(loop: FocusLoop): void {
        this.activeActivationOptions.delete(loop);
    }

    private getCloseFocusMode(loop: FocusLoop): FocusMode | undefined {
        return this.activeActivationOptions.get(loop)?.closeFocusMode ?? loop.closeFocusMode;
    }

    private getExitSelector(loop: FocusLoop): string | WeakRef<HTMLElement> | HTMLElement | undefined {
        return this.activeActivationOptions.get(loop)?.exitSelector ?? loop.exitSelector;
    }

    private loopRequiresDeactivation(loop: FocusLoop): boolean | string | WeakRef<HTMLElement> | HTMLElement | undefined {
        return this.getExitSelector(loop) || loop.modal || this.getCloseFocusMode(loop) || loop.needsDeactivate;
    }

    private shouldSuspendFocusedLoopFor(loop: FocusLoop): boolean {
        const focused = this.focusedLoop;
        return !!focused && !!focused.modal && (!!loop.modal || focused.element.contains(loop.element));
    }

    private suspendFocusedLoop(): void {
        const focused = this.focusedLoop;
        if (focused)
            this.modalChain.push(focused);
    }

    private unwindModalChainFor(loop: FocusLoop): void {
        while (this.modalChain.length > 0) {
            const top = this.modalChain[this.modalChain.length - 1];
            if (top.element.contains(loop.element))
                break;
            this.deactivate(top.element, this.focusTransferDeactivateOptions());
            this.modalChain.pop();
        }
        this.assertLifecycleState('unwind-modal-chain');
    }

    private refreshActiveLoopActivation(loop: FocusLoop, loopElement: HTMLElement, options: IFocusLoopActivateOptions): void {
        try {
            this.setActivatingLoop(loop);
            this.focusLoop(loop);

            if (loop.modal)
                this.activateModal(loop);

            this.setActiveActivationOptions(loop, options);
            loop.emit('activate');
            this.focusActivatedLoop(loopElement, options);
        }
        finally {
            this.clearActivatingLoop();
        }
        this.assertLifecycleState('activate-active-loop');
    }

    private focusLoop(loop: FocusLoop): void {
        const focused = this.focusedLoop;
        if (focused && focused !== loop) {
            let closeCurrentLoop = true;

            if (this.shouldSuspendFocusedLoopFor(loop)) {
                this.suspendFocusedLoop();
                closeCurrentLoop = false;
            }
            else {
                this.unwindModalChainFor(loop);
            }

            if (closeCurrentLoop && this.shouldDeactivateFocusedLoopFor(focused, loop))
                this.deactivate(focused.element, this.focusTransferDeactivateOptions());

            this.clearFocusedLoop();
        }

        if (this.focusedLoop === null && loop.initialFocusMode === undefined)
            loop.initialFocusMode = this.modes.getMode();

        this.setFocusedLoop(loop);
    }

    private shouldDeactivateFocusedLoopFor(focused: FocusLoop, loop: FocusLoop): boolean | string | WeakRef<HTMLElement> | HTMLElement | undefined {
        return this.loopRequiresDeactivation(focused) || !focused.element.contains(loop.element);
    }

    private focusActivatedLoop(loopElement: HTMLElement, options: IFocusLoopActivateOptions): void {
        if (loopElement.contains(document.activeElement) && document.activeElement !== loopElement)
            return;

        if (!options.withMouse) {
            const parent = loopElement.closest('.menu-level') as HTMLElement;
            if (parent) {
                const list = this.navigator.keyboardfocusableElements(parent, parent.getAttribute('fl-level')!, true);
                if (list.length > 0)
                    (options.direction === 'up' ? list[list.length - 1] : list[0]).focus();
            }
        }
        else if (!loopElement.contains(document.activeElement)) {
            loopElement.focus();
        }
    }

    private deactivateDetailed(loopElement: HTMLElement, options: Required<IFocusLoopDeactivateOptions>): FocusLoopDeactivateResult {
        const loop = this.registry.findLoop(loopElement);
        if (!loop)
            return { deactivated: false, reason: 'inactive' };

        const deactivateRequest = this.requestDeactivate(loop, options);
        if (!deactivateRequest.allowed)
            return deactivateRequest.result;

        this.finalizeDeactivateState(loop);

        if (this.loopRequiresDeactivation(loop) === false) {
            this.clearActiveActivationOptions(loop);
            return {
                deactivated: true,
                focusPassed: false,
                exitElementFound: false,
            };
        }

        const validExitElement = this.prepareDeactivateFocus(loop, options);

        const focusPassed = this.focusPass.complete();

        this.restoreDeactivateMode(loop, focusPassed);
        this.clearActiveActivationOptions(loop);

        return {
            deactivated: true,
            focusPassed,
            exitElementFound: validExitElement,
        };
    }

    private requestDeactivate(loop: FocusLoop, options: Required<IFocusLoopDeactivateOptions>): { allowed: true } | { allowed: false, result: FocusLoopDeactivateResult } {
        if (loop.state === 'deactivating')
            return { allowed: false, result: { deactivated: false, reason: 'already-deactivating' } };
        if (loop.state !== 'active')
            return { allowed: false, result: { deactivated: false, reason: 'inactive' } };

        this.setLoopState(loop, 'deactivating');
        const eventData = this.createDeactivateEvent(options);
        loop.emit('deactivate', eventData);

        if (eventData.cancel && eventData.canCancel) {
            this.setLoopState(loop, 'active');
            return { allowed: false, result: { deactivated: false, reason: 'cancelled' } };
        }

        return { allowed: true };
    }

    private createDeactivateEvent(options: Required<IFocusLoopDeactivateOptions>): IFocusLoopDeactivateEvent {
        return {
            cancel: false,
            canCancel: this.canCancelDeactivate(options),
            passFocus: false,
            withMouse: options.source === 'mouse',
            reason: options.source,
        };
    }

    private finalizeDeactivateState(loop: FocusLoop): void {
        this.clearActivationStabilizer(loop);
        this.clearPendingUnknownFocusOutIf(loop);

        if (loop.modal)
            this.deactivateModal(loop);

        this.setLoopState(loop, 'registered');
        const focused = this.focusedLoop;
        if (focused) {
            if (focused === loop)
                this.clearFocusedLoopIf(loop);
            else
                focused.initialFocusMode = loop.initialFocusMode;
        }
    }

    private prepareDeactivateFocus(loop: FocusLoop, options: Required<IFocusLoopDeactivateOptions>): boolean {
        this.focusPass.clear();
        const exitSelector = this.getExitSelector(loop);
        if (!this.shouldAllowDeactivateFocusPassing(options) || !exitSelector)
            return false;

        const element = this.resolveExitSelector(exitSelector);
        if (!element)
            return false;

        const parent = element.closest('.menu-level') as HTMLElement;
        this.focusPass.prepare(element, this.modes.inKeyboardMode() || element.hasAttribute('tabindex') || (parent && parent.hasAttribute('tabindex')));
        return true;
    }

    private restoreDeactivateMode(loop: FocusLoop, focusPassed: boolean): void {
        const closeFocusMode = this.getCloseFocusMode(loop);
        if (closeFocusMode)
            this.modes.set(closeFocusMode);
        else if (loop.modal && !focusPassed && loop.initialFocusMode !== 'keyTips' && loop.initialFocusMode)
            this.modes.set(loop.initialFocusMode);
    }

    private activateModal(loop: FocusLoop): void {
        this.setActiveModal(loop);
        this.modes.setDefault('hover', {});
    }

    private focusTransferDeactivateOptions(): Required<IFocusLoopDeactivateOptions> {
        return {
            source: 'focus-transfer',
        };
    }

    private canCancelDeactivate(options: Required<IFocusLoopDeactivateOptions>): boolean {
        return options.source !== 'mouse';
    }

    private shouldAllowDeactivateFocusPassing(options: Required<IFocusLoopDeactivateOptions>): boolean {
        return options.source === 'programmatic';
    }

    private deactivateModal(loop: FocusLoop): void {
        if (this.activeModal !== this.focusedLoop) {
            this.closeModalChainUntilActiveModal();
        }

        const resumedModal = this.popSuspendedModal(loop);
        if (resumedModal) {
            this.setActiveModal(resumedModal);
            this.setFocusedLoop(resumedModal);
            this.modes.setDefault('hover', {});
            this.navigator.findFocusableElement(resumedModal.element);
            return;
        }

        this.modes.setDefault('default', {});
        this.clearActiveModal();
    }

    private popSuspendedModal(loop: FocusLoop): FocusLoop | null {
        while (this.modalChain.length > 0) {
            const modal = this.modalChain.pop();
            if (!modal || modal === loop)
                continue;
            if (modal.state === 'active' && modal.element.isConnected)
                return modal;
            if (modal.state === 'active')
                this.discardSuspendedModal(modal);
        }
        return null;
    }

    private discardSuspendedModal(loop: FocusLoop): void {
        this.setLoopState(loop, 'deactivating');
        this.setLoopState(loop, 'registered');
        this.clearActiveActivationOptions(loop);
        this.clearActiveModalIf(loop);
        this.clearFocusedLoopIf(loop);
    }

    private closeModalChainUntilActiveModal(): void {
        while (this.modalChain.length > 0) {
            const top = this.modalChain.pop();
            if (top === this.activeModal)
                break;
            if (top && this.loopRequiresDeactivation(top))
                this.deactivate(top.element, this.focusTransferDeactivateOptions());
        }
        this.assertLifecycleState('close-modal-chain');
    }

    private resolveExitSelector(selector: string | WeakRef<HTMLElement> | HTMLElement): HTMLElement | null | undefined {
        if (typeof selector === 'string')
            return document.querySelector(selector) as HTMLElement;
        if (selector instanceof WeakRef)
            return selector.deref();
        return selector;
    }

    private setLoopState(loop: FocusLoop, state: FocusLoopState): void {
        const previousState = loop.state;
        if (!this.canTransitionLoopState(previousState, state))
            console.warn('Unexpected focus loop state transition', { from: previousState, to: state, element: loop.element });
        loop.state = state;
    }

    private assertLifecycleState(context: string): void {
        this.assertLoopReference('activeModalLoop', this.activeModalLoop, 'active', context);
        this.assertLoopReference('focusedLoop', this.focusedLoop, 'active', context);
        this.assertLoopReference('activatingLoop', this.activatingLoop, ['activating', 'active'], context);

        for (let i = 0; i < this.modalChain.length; i++) {
            const loop = this.modalChain[i];
            if (loop.state === 'removed' || !loop.element.isConnected)
                console.warn('Unexpected focus loop modal chain item', { context, index: i, state: loop.state, element: loop.element });
        }
    }

    private assertLoopReference(name: string, loop: FocusLoop | null, expectedStates: FocusLoopState | FocusLoopState[], context: string): void {
        if (!loop)
            return;

        const states = Array.isArray(expectedStates) ? expectedStates : [expectedStates];
        if (!states.includes(loop.state))
            console.warn('Unexpected focus loop reference state', { context, name, expectedStates: states, actualState: loop.state, element: loop.element });

        if (!loop.element.isConnected)
            console.warn('Unexpected focus loop reference to disconnected element', { context, name, state: loop.state, element: loop.element });
    }

    private canTransitionLoopState(from: FocusLoopState, to: FocusLoopState): boolean {
        return from === to || allowedLoopStateTransitions[from].includes(to);
    }
}
