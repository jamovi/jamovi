import { EventEmitter } from 'eventemitter3';
import type { FocusLoopMessageRouter } from './messagerouter';
import type { WindowBridge } from './windowbridge';

export type FocusMode = 'default' | 'keyTips' | 'accessible' | 'hover' | 'keyboard';

export type FocusModeOptions = { silent?: boolean, noTransfer?: boolean };

export type FocusModeTransition = {
    previousMode: FocusMode;
    mode: FocusMode;
    options?: FocusModeOptions;
    fromBroadcast: boolean;
};

type WindowFocusState = {
    isBlurring: boolean;
    isBlurred: boolean;
};

type FocusModeControllerDeps = {
    windowBridge: WindowBridge;
    messageRouter: FocusLoopMessageRouter;
    getWindowFocusState: () => WindowFocusState;
};

export class FocusModeController extends EventEmitter {
    private readonly windowBridge: WindowBridge;
    private readonly messageRouter: FocusLoopMessageRouter;
    private readonly getWindowFocusState: () => WindowFocusState;
    private mode: FocusMode = 'default';
    private defaultMode: FocusMode = 'default';
    private defaultFocusControl: HTMLElement | null = null;
    private defaultModeResetTimer: ReturnType<typeof setTimeout> | null = null;
    private broadcastTimer: ReturnType<typeof setTimeout> | null = null;
    private usingDefaultMode = false;

    constructor(deps: FocusModeControllerDeps) {
        super();
        this.windowBridge = deps.windowBridge;
        this.messageRouter = deps.messageRouter;
        this.getWindowFocusState = deps.getWindowFocusState;
    }

    setDefaultFocusControl(defaultFocusControl: HTMLElement): void {
        this.defaultFocusControl = defaultFocusControl;
        if (this.defaultFocusControl && this.usingDefaultMode)
            this.defaultFocusControl.focus();
    }

    getDefaultFocusControl(): HTMLElement | null {
        return this.defaultFocusControl;
    }

    shouldRestoreDefaultFocusControl(target: EventTarget | null, relatedTarget: EventTarget | null): boolean {
        return !!this.defaultFocusControl && target === this.defaultFocusControl && relatedTarget === null && this.usingDefaultMode;
    }

    restoreDefaultFocusControl(): void {
        if (this.defaultFocusControl)
            this.defaultFocusControl.focus();
    }

    clearDefaultModeReset(): void {
        if (this.defaultModeResetTimer) {
            clearTimeout(this.defaultModeResetTimer);
            this.defaultModeResetTimer = null;
        }
    }

    scheduleDefaultModeReset(): void {
        this.clearDefaultModeReset();
        this.defaultModeResetTimer = setTimeout(() => {
            this.set('default');
            this.defaultModeResetTimer = null;
        }, 0);
    }

    scheduleFocusModeBroadcast(): void {
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = null;
        }

        this.broadcastTimer = setTimeout(() => {
            this.broadcastTimer = null;
            this.broadcastFocusMode(this.getMode());
        }, 0);
    }

    getMode(): FocusMode {
        return this.mode;
    }

    getDefaultMode(): FocusMode {
        return this.defaultMode;
    }

    inAccessibilityMode(): boolean {
        return this.mode === 'accessible' || this.mode === 'keyTips';
    }

    inKeyboardMode(): boolean {
        return this.mode === 'accessible' || this.mode === 'keyTips' || this.mode === 'keyboard';
    }

    setDefault(value: FocusMode, options?: FocusModeOptions): void {
        this.assertValidMode(value);

        const fromBroadcast = this.messageRouter.isFromBroadcast();
        if (value === this.defaultMode)
            return;

        this.defaultMode = value;
        if (this.shouldBroadcastModeChange(fromBroadcast)) {
            this.broadcastDefaultMode(value, options);
            if (this.usingDefaultMode)
                this.set('default');
        }
    }

    set(value: FocusMode, options?: FocusModeOptions): void {
        this.clearDefaultModeReset();

        const nextMode = this.resolveRequestedMode(value);
        const fromBroadcast = this.messageRouter.isFromBroadcast();
        if (this.mode === nextMode)
            return;

        const prevMode = this.mode;
        this.mode = nextMode;

        this.runModeTransitionEffects({ previousMode: prevMode, mode: nextMode, options, fromBroadcast });
        this.updateBodyAttributes();
    }

    updateBodyAttributes(): void {
        document.body.setAttribute('accessible', this.inAccessibilityMode() ? 'true' : 'false');
        document.body.setAttribute('keyboardfocus', this.inKeyboardMode() ? 'true' : 'false');
        document.body.setAttribute('focusMode', this.mode);
    }

    private assertValidMode(value: string): asserts value is FocusMode {
        if (!this.isValid(value))
            throw new Error(`Unknown focusMode - "${value}"`);
    }

    private isValid(value: string): value is FocusMode {
        return value === 'keyTips' || value === 'accessible' || value === 'keyboard' || value === 'hover' || value === 'default';
    }

    private resolveRequestedMode(value: FocusMode): FocusMode {
        this.assertValidMode(value);
        this.usingDefaultMode = value === 'default';
        return this.usingDefaultMode ? this.defaultMode : value;
    }

    private runModeTransitionEffects(transition: FocusModeTransition): void {
        this.focusDefaultControlIfNeeded(transition.mode);

        if (this.shouldBroadcastModeChange(transition.fromBroadcast))
            this.broadcastFocusMode(transition.mode, transition.options);

        this.emit('modeChanged', transition);
    }

    private focusDefaultControlIfNeeded(mode: FocusMode): void {
        if (this.defaultFocusControl && mode === 'default')
            this.defaultFocusControl.focus();
    }

    private shouldBroadcastModeChange(fromBroadcast: boolean): boolean {
        const windowFocus = this.getWindowFocusState();
        return !fromBroadcast && !windowFocus.isBlurring && !windowFocus.isBlurred;
    }

    private broadcastFocusMode(focusMode: FocusMode, options?: FocusModeOptions): void {
        const noTransfer = options ? options.noTransfer : false;
        this.windowBridge.broadcast('setFocusMode', [focusMode, options], !noTransfer && focusMode !== 'keyboard' && focusMode !== 'hover');
    }

    private broadcastDefaultMode(value: FocusMode, options?: FocusModeOptions): void {
        const noTransfer = options ? options.noTransfer : false;
        this.windowBridge.broadcast('setFocusDefault', [value, options], !noTransfer);
    }
}
