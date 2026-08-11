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

// Deactivate handlers can re-enter the lifecycle and take focus ownership back,
// so handing ownership over is retried. This bounds a handler pair that keeps
// re-activating each other.
const maxFocusedLoopReleasePasses = 8;

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
    private activatingLoops: FocusLoop[] = [];
    private pendingActivations = new WeakMap<FocusLoop, IFocusLoopActivateOptions>();
    private activationStabilizers = new WeakMap<FocusLoop, ReturnType<typeof setTimeout>>();
    private pendingUnknownFocusOut: PendingUnknownFocusOut | null = null;
    private pendingUnknownFocusOutTimer: ReturnType<typeof setTimeout> | null = null;
    // A native <select> can blur with relatedTarget null while its own popup
    // is still legitimately open (see resolvePendingUnknownFocusOut), so that
    // case is deliberately left unresolved rather than restoring default
    // focus. If the popup instead closed because the user clicked elsewhere,
    // that click's pointerdown reaches this page-level listener - which is
    // only possible once the popup is no longer capturing input - so it is
    // used as the signal to finish the deferred recovery.
    private awaitingNativeSelectFocusOut = false;
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
        return this.activatingLoops.some(activating => element.contains(activating.element));
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

        if (pending.fromNativeSelect) {
            this.awaitingNativeSelectFocusOut = true;
            return;
        }

        this.finishUnknownFocusOutRecovery();
    }

    private finishUnknownFocusOutRecovery(): void {
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
        this.awaitingNativeSelectFocusOut = false;

        const pausedFocusControl = this.getPausedFocusControl();
        if (pausedFocusControl) {
            if (element !== pausedFocusControl)
                pausedFocusControl.focus();
            return;
        }

        this.reconcileDeadLoopReferences('focusin');

        const loopElement = this.findRegisteredLoopElementForFocus(element);

        if (this.shouldRestoreStabilizingFocusedLoopFor(element)) {
            this.restoreFocusIntoLoop(this.focusedLoop!);
            return;
        }

        if (this.activeModalLoop && !this.activeModalLoop.element.contains(element) && !this.isPendingModalActivation(loopElement)) {
            if (this.modalCanHoldFocus(this.activeModalLoop)) {
                this.navigator.findFocusableElement(this.activeModalLoop.element);
                return;
            }

            // Trapping focus into a modal that cannot take it would swallow
            // every focusin from here on, with no way back.
            this.releaseUnusableModal(this.activeModalLoop);
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
                // Focus landing here is a loop handing focus back to its
                // opener (e.g. Escape closing a dropdown), not a fresh user
                // focus target, but it should still reflect how that opener
                // was reached: classifying it below picks 'keyboard' mode
                // when the close itself came from the keyboard (fromPointer
                // is false by then) and 'hover' when it came from the mouse,
                // instead of silently keeping whatever mode was active
                // before the loop opened.
                if (!this.modes.inAccessibilityMode())
                    this.classifyFocusMode(element, composedPath);
            }
            else if (!this.modes.inAccessibilityMode()) {
                this.classifyFocusMode(element, composedPath);
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

    private classifyFocusMode(element: HTMLElement, composedPath: EventTarget[]): void {
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

    reconcilePointerDown(element: Element): void {
        // pointerdown fires before the mousedown it accompanies, and it is
        // that mousedown's default focus-shift which blurs a native <select>
        // and schedules deferUnknownFocusOut()'s own setTimeout(0). So on the
        // very click that dismisses the popup, awaitingNativeSelectFocusOut
        // is not set yet at this point - checking it here would race that
        // resolver and lose every time. Deferring twice reliably lands after
        // it: the first tick runs after this task ends, once the blur's
        // resolver has already been queued (even if not yet run); the second
        // then runs after that resolver, which was queued first and so fires
        // first.
        setTimeout(() => {
            setTimeout(() => {
                if (!this.awaitingNativeSelectFocusOut)
                    return;
                this.awaitingNativeSelectFocusOut = false;
                if (typeof document.hasFocus === 'function' && !document.hasFocus())
                    return;
                const activeElement = document.activeElement;
                if (activeElement instanceof HTMLElement && activeElement !== document.body)
                    return;
                this.finishUnknownFocusOutRecovery();
            }, 0);
        }, 0);

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
        const wasActiveModal = this.activeModalLoop === loop;
        this.setLoopState(loop, 'removed');
        this.clearActiveModalIf(loop);
        this.clearFocusedLoopIf(loop);
        this.clearActivatingLoops(loop);
        this.clearActiveActivationOptions(loop);
        this.clearFocusedElement(loop);
        this.clearActivationStabilizer(loop);
        this.clearPendingUnknownFocusOutIf(loop);
        this.pendingActivations.delete(loop);
        this.removeFromModalChain(loop);

        if (wasActiveModal)
            this.promoteSuspendedModal(loop);

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

        try {
            if (loop.state === 'active') {
                this.refreshActiveLoopActivation(loop, loopElement, options);
                this.assertLifecycleState('activate-active');
                return;
            }

            try {
                this.pushActivatingLoop(loop);

                // Opening, so the loop must be focusable from here on. This is
                // deliberately not undone if the activation below fails to
                // place focus: a loop is commonly activated while it is still
                // being shown, and cannot take focus until the browser has
                // rendered it. Blocking it again would make the loop that the
                // caller just opened permanently unfocusable, so it stays open
                // to focus and activates when focus does arrive.
                this.registry.releaseInactiveFocus(loop);

                if (loop.state === 'registered')
                    this.setLoopState(loop, 'activating');

                if (this.shouldCommitCurrentFocusOnActivate(loop, loopElement))
                    this.commitFocusedLoop(loopElement, document.activeElement as HTMLElement);
                else {
                    this.focusActivatedLoop(loopElement, options);
                    if (loopElement.contains(document.activeElement))
                        this.commitFocusedLoop(loopElement, document.activeElement as HTMLElement);
                }

                if (loop.state === 'activating')
                    this.setLoopState(loop, 'registered');
            }
            finally {
                this.popActivatingLoop(loop);
            }
            this.assertLifecycleState('activate-request');
        }
        finally {
            // A pending activation is only meaningful while this request is
            // moving focus; the focusin it triggers consumes it. Anything left
            // behind keeps suppressing the modal trap, active-root focus
            // restoration, and keyToEnter delegation for this loop forever.
            // A request made while the loop is deactivating never commits, so
            // this is the only place its entry gets cleared.
            this.pendingActivations.delete(loop);
        }
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

    /**
     * Activation requests nest: activate() moves focus, the resulting focusin
     * commits the loop, and a deactivate handler along the way can start
     * another activation. Tracking them as a stack keeps an inner request from
     * cancelling out an outer one that is still in flight.
     */
    private pushActivatingLoop(loop: FocusLoop): void {
        this.activatingLoops.push(loop);
    }

    private popActivatingLoop(loop: FocusLoop): void {
        const index = this.activatingLoops.lastIndexOf(loop);
        if (index !== -1)
            this.activatingLoops.splice(index, 1);
    }

    private clearActivatingLoops(loop: FocusLoop): void {
        this.activatingLoops = this.activatingLoops.filter(activating => activating !== loop);
    }

    private removeFromModalChain(loop: FocusLoop): void {
        for (let i = this.modalChain.length - 1; i >= 0; i--) {
            if (this.modalChain[i] === loop)
                this.modalChain.splice(i, 1);
        }
    }

    /**
     * Promotes the next suspended modal after the current active modal is lost
     * without a normal deactivation. Lifecycle state only; focus is left where
     * it is so this can run from inside focus handling.
     */
    private promoteSuspendedModal(lostLoop: FocusLoop): void {
        const resumed = this.popSuspendedModal(lostLoop);
        if (!resumed) {
            this.modes.setDefault('default', {});
            return;
        }

        this.setActiveModal(resumed);
        if (this.focusedLoop === null)
            this.setFocusedLoop(resumed);
        this.modes.setDefault('hover', {});
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
            this.pushActivatingLoop(loop);
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
            this.popActivatingLoop(loop);
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
        if (focused) {
            this.removeFromModalChain(focused);
            this.modalChain.push(focused);
        }
    }

    private unwindModalChainFor(loop: FocusLoop): void {
        while (this.modalChain.length > 0) {
            const top = this.modalChain[this.modalChain.length - 1];
            if (top.element.contains(loop.element))
                break;

            // Popped before deactivating: deactivate handlers re-enter and pop
            // from this same chain, so popping afterwards would discard an
            // entry this loop never looked at, leaving it active and
            // unreferenced.
            this.modalChain.pop();
            this.deactivate(top.element, this.focusTransferDeactivateOptions());
        }
        this.assertLifecycleState('unwind-modal-chain');
    }

    private refreshActiveLoopActivation(loop: FocusLoop, loopElement: HTMLElement, options: IFocusLoopActivateOptions): void {
        try {
            this.pushActivatingLoop(loop);
            this.focusLoop(loop);

            if (loop.modal)
                this.activateModal(loop);

            this.setActiveActivationOptions(loop, options);
            loop.emit('activate');
            this.focusActivatedLoop(loopElement, options);
        }
        finally {
            this.popActivatingLoop(loop);
        }
        this.assertLifecycleState('activate-active-loop');
    }

    private focusLoop(loop: FocusLoop): void {
        this.releaseFocusedLoopFor(loop);

        if (this.focusedLoop === null && loop.initialFocusMode === undefined)
            loop.initialFocusMode = this.modes.getMode();

        this.setFocusedLoop(loop);
    }

    /**
     * Hands focus ownership over from the currently focused loop.
     *
     * Deactivating a loop runs component code that can focus other elements and
     * activate other loops, which re-enters the lifecycle and leaves a
     * different loop focused. Each pass therefore re-reads the focused loop and
     * releases whatever is focused now, instead of assuming it is still the
     * loop seen on entry. Releasing the wrong one would strand the new loop as
     * active with nothing referencing it.
     */
    private releaseFocusedLoopFor(loop: FocusLoop): void {
        for (let pass = 0; pass < maxFocusedLoopReleasePasses; pass++) {
            const focused = this.focusedLoop;
            if (!focused || focused === loop)
                return;

            if (this.shouldSuspendFocusedLoopFor(loop)) {
                this.suspendFocusedLoop();
            }
            else {
                this.unwindModalChainFor(loop);
                if (this.shouldDeactivateFocusedLoopFor(focused, loop))
                    this.deactivate(focused.element, this.focusTransferDeactivateOptions());
            }

            this.clearFocusedLoopIf(focused);
        }

        console.warn('Focus loop ownership did not settle', { element: loop.element, focused: this.focusedLoop?.element });
        this.clearFocusedLoop();
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

        this.removeFromModalChain(loop);

        this.setLoopState(loop, 'registered');
        // Closed, so block focus. Applied after the deactivate handler has run
        // and before focus is passed on, which targets the exit selector
        // outside the loop.
        this.registry.blockInactiveFocus(loop);
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
        // A suspended modal deactivating does not change which modal is active.
        // It only leaves the chain, which finalizeDeactivateState handles.
        if (this.activeModalLoop !== loop)
            return;

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
        this.registry.blockInactiveFocus(loop);
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
        this.reconcileDeadLoopReferences(context);

        // 'deactivating' is legitimate here: these run from nested contexts, so
        // a loop can be observed part way through its own teardown.
        // activatingLoops is deliberately not state-checked. It tracks
        // in-flight activation requests, not loop states, and a request can
        // outlive the loop being deactivated by re-entrant code. Dead entries
        // are handled by reconcileDeadLoopReferences above.
        this.assertLoopReference('activeModalLoop', this.activeModalLoop, ['active', 'deactivating'], context);
        this.assertLoopReference('focusedLoop', this.focusedLoop, ['active', 'deactivating'], context);
    }

    /**
     * Drops lifecycle references to loops whose element has left the document,
     * or that have been unregistered, without a preceding deactivate().
     *
     * Callers are expected to deactivate before hiding or removing UI, but a
     * missed call must not leave a dead loop owning focus or trapping it.
     * Deactivate handlers are not run here: the element is already gone, so the
     * owning component has nothing left to tear down.
     */
    private reconcileDeadLoopReferences(context: string): void {
        // Captured first: releasing any reference to this loop also clears it
        // as the active modal, and the modal still has to be replaced.
        const lostModal = this.activeModalLoop && this.isDeadLoop(this.activeModalLoop) ? this.activeModalLoop : null;

        this.pruneModalChain(context);

        for (const activating of [...this.activatingLoops]) {
            if (this.isDeadLoop(activating))
                this.releaseDeadLoop('activatingLoop', activating, context);
        }

        if (this.focusedLoop && this.isDeadLoop(this.focusedLoop))
            this.releaseDeadLoop('focusedLoop', this.focusedLoop, context);

        if (!lostModal)
            return;

        if (this.activeModalLoop === lostModal)
            this.releaseDeadLoop('activeModalLoop', lostModal, context);

        this.promoteSuspendedModal(lostModal);
    }

    private pruneModalChain(context: string): void {
        for (let i = this.modalChain.length - 1; i >= 0; i--) {
            const loop = this.modalChain[i];
            if (!this.isDeadLoop(loop))
                continue;

            console.warn('Released dead focus loop modal chain item', { context, index: i, state: loop.state, element: loop.element });
            this.modalChain.splice(i, 1);
            this.releaseDeadLoopState(loop);
        }
    }

    private isDeadLoop(loop: FocusLoop): boolean {
        return loop.state === 'removed' || !loop.element.isConnected;
    }

    /**
     * Whether a modal is still able to hold the focus it traps. A modal hidden
     * with CSS stays connected, so isDeadLoop() cannot see it, but focus can no
     * longer be placed inside it.
     *
     * Deliberately tests the modal root only, not whether it has focusable
     * content: a visible modal that is still rendering its contents must keep
     * its trap. Uses the same conditions as keyboardfocusableElements().
     */
    private modalCanHoldFocus(loop: FocusLoop): boolean {
        const element = loop.element;
        if (this.isDeadLoop(loop) || element.hasAttribute('inert'))
            return false;

        if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0)
            return false;

        if (typeof globalThis.getComputedStyle === 'function' && globalThis.getComputedStyle(element).visibility === 'hidden')
            return false;

        return true;
    }

    private releaseUnusableModal(loop: FocusLoop): void {
        console.warn('Released focus loop modal that can no longer hold focus', { state: loop.state, element: loop.element });
        this.removeFromModalChain(loop);
        this.releaseDeadLoopState(loop);
        this.promoteSuspendedModal(loop);
    }

    private releaseDeadLoop(name: string, loop: FocusLoop, context: string): void {
        console.warn('Released dead focus loop reference', { context, name, state: loop.state, element: loop.element });
        this.removeFromModalChain(loop);
        this.releaseDeadLoopState(loop);
    }

    private releaseDeadLoopState(loop: FocusLoop): void {
        this.clearActiveModalIf(loop);
        this.clearFocusedLoopIf(loop);
        this.clearActivatingLoops(loop);
        this.clearActivationStabilizer(loop);
        this.clearActiveActivationOptions(loop);
        this.clearFocusedElement(loop);
        this.clearPendingUnknownFocusOutIf(loop);
        this.pendingActivations.delete(loop);

        if (loop.state === 'active')
            this.setLoopState(loop, 'deactivating');
        if (loop.state === 'activating' || loop.state === 'deactivating')
            this.setLoopState(loop, 'registered');

        this.registry.blockInactiveFocus(loop);
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
