import type { FocusElementClassifier } from './classifier';
import type { FocusLoopLifecycle } from './lifecycle';
import type { ShortcutRegistry } from './shortcuts';
import type { FocusModeController } from './modecontroller';
import type { KeyPressType } from './shortcuts';
import type { KeyTipController } from './keytipcontroller';
import type { WindowBridge } from './windowbridge';

type GlobalKeyboardCommandDeps = {
    classifier: FocusElementClassifier;
    shortcuts: ShortcutRegistry;
    lifecycle: FocusLoopLifecycle;
    modes: FocusModeController;
    keyTips: KeyTipController;
    windowBridge: WindowBridge;
    processKeyInActiveModal(keyObj: KeyPressType): boolean;
};

export class GlobalKeyboardCommandController {
    private readonly classifier: FocusElementClassifier;
    private readonly shortcuts: ShortcutRegistry;
    private readonly lifecycle: FocusLoopLifecycle;
    private readonly modes: FocusModeController;
    private readonly keyTips: KeyTipController;
    private readonly windowBridge: WindowBridge;
    private readonly processKeyInActiveModal: (keyObj: KeyPressType) => boolean;
    private browserAltPressStarted = false;
    private desktopAltKeyTipState = {
        ctrlDown: false,
        altDown: false,
        altTimer: null as ReturnType<typeof setTimeout> | null,
        turnedOn: false,
    };

    constructor(deps: GlobalKeyboardCommandDeps) {
        this.classifier = deps.classifier;
        this.shortcuts = deps.shortcuts;
        this.lifecycle = deps.lifecycle;
        this.modes = deps.modes;
        this.keyTips = deps.keyTips;
        this.windowBridge = deps.windowBridge;
        this.processKeyInActiveModal = deps.processKeyInActiveModal;
    }

    installGlobalListeners(desktopMode: boolean): void {
        if (desktopMode) {
            window.addEventListener('keydown', event => this.handleDesktopKeyDown(event));
            window.addEventListener('keyup', event => this.handleDesktopKeyUp(event));
        }
        else {
            window.addEventListener('keydown', event => this.handleBrowserKeyDown(event));
            window.addEventListener('keyup', event => this.handleBrowserKeyUp(event));
        }
    }

    private handleSharedShortcutKeyDown(event: KeyboardEvent): boolean {
        const keyObj = this.shortcuts.eventToKeyObj(event);
        if (!this.classifier.activeElementIsEditableTextbox(this.modes.getDefaultFocusControl())) {
            if (this.processKeyInActiveModal(keyObj) === false) {
                if (!this.windowBridge.isMainWindow && this.shortcuts.hasBaseKeyPath(keyObj)) {
                    event.preventDefault();
                    this.windowBridge.broadcast('processKeyObj', [keyObj], false);
                    return true;
                }
            }
            else {
                event.preventDefault();
                return true;
            }
        }
        return false;
    }

    private handleDesktopKeyDown(event: KeyboardEvent): void {
        this.handleSharedShortcutKeyDown(event);

        if (event.altKey && event.key === 'F4')
            return;

        if (event.ctrlKey) {
            this.desktopAltKeyTipState.ctrlDown = true;
            return;
        }

        if (!this.lifecycle.activeModalAllowsKeyPaths())
            return;

        if (event.altKey) {
            if (this.modes.getMode() !== 'keyTips') {
                this.desktopAltKeyTipState.altDown = true;
                if (!this.desktopAltKeyTipState.altTimer) {
                    this.keyTips.clearCurrentPath();
                    this.desktopAltKeyTipState.altTimer = setTimeout(() => {
                        if (!this.desktopAltKeyTipState.ctrlDown) {
                            this.modes.set('keyTips');
                            this.desktopAltKeyTipState.turnedOn = true;
                        }
                        this.desktopAltKeyTipState.altTimer = null;
                    }, 1000);
                }

                if (event.keyCode !== 18)
                    this.keyTips.appendKey(event.key.toUpperCase());
            }

            event.preventDefault();
            event.stopPropagation();
        }
    }

    private handleDesktopKeyUp(event: KeyboardEvent): void {
        if (event.ctrlKey)
            this.desktopAltKeyTipState.ctrlDown = true;

        if (event.keyCode !== 18)
            return;

        this.desktopAltKeyTipState.altDown = false;
        if (this.desktopAltKeyTipState.altTimer) {
            clearTimeout(this.desktopAltKeyTipState.altTimer);
            this.desktopAltKeyTipState.altTimer = null;
        }

        if (!this.desktopAltKeyTipState.ctrlDown) {
            if (!this.desktopAltKeyTipState.turnedOn) {
                if (this.modes.getMode() === 'keyTips') {
                    this.keyTips.clearCurrentPath();
                    this.modes.set('default');
                }
                else {
                    this.modes.set('keyTips');
                }
            }
            this.desktopAltKeyTipState.turnedOn = false;
            event.preventDefault();
            event.stopPropagation();
        }

        this.desktopAltKeyTipState.ctrlDown = false;
    }

    private handleBrowserKeyDown(event: KeyboardEvent): void {
        this.handleSharedShortcutKeyDown(event);

        if (event.altKey && event.key !== 'Alt')
            this.browserAltPressStarted = false;
        else if (event.key === 'Alt' && this.lifecycle.activeModalAllowsKeyPaths())
            this.browserAltPressStarted = true;
    }

    private handleBrowserKeyUp(event: KeyboardEvent): void {
        if (!this.browserAltPressStarted)
            return;

        this.browserAltPressStarted = false;
        if (event.key !== 'Alt')
            return;

        if (!event.ctrlKey) {
            if (this.modes.getMode() === 'keyTips') {
                this.keyTips.clearCurrentPath();
                this.modes.set('default');
            }
            else {
                this.keyTips.clearCurrentPath();
                this.modes.set('keyTips');
            }
        }

        event.preventDefault();
        event.stopPropagation();
    }
}
