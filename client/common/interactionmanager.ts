// README: ./interactionmanager/README.md

'use strict';

import { EventEmitter } from 'tsee';
import { FocusElementClassifier } from './interactionmanager/classifier';
import { FocusLoopEventController } from './interactionmanager/eventcontroller';
import { GlobalKeyboardCommandController } from './interactionmanager/globalkeyboard';
import { FocusInputTracker } from './interactionmanager/input';
import { ShortcutRegistry } from './interactionmanager/shortcuts';
import { FocusLoopKeyboardNavigation } from './interactionmanager/keyboardnavigation';
import { FocusLoopLifecycle } from './interactionmanager/lifecycle';
import { FocusLoopMessageRouter } from './interactionmanager/messagerouter';
import { FocusNavigator } from './interactionmanager/focusnavigator';
import { FocusModeController } from './interactionmanager/modecontroller';
import { KeyTipController } from './interactionmanager/keytipcontroller';
import { FocusLoopRegistry } from './interactionmanager/loopregistry';
import { WindowBridge } from './interactionmanager/windowbridge';
export type {
    IFocusLoopActivateOptions,
    IFocusLoopOptions,
    FocusLoop,
    FocusLoopDeactivateCause,
    IFocusLoopDeactivateOptions,
} from './interactionmanager/focustype';
export type {
    IKeyTipActionEvent,
    IKeyTipTokenOptions,
    IKeyTipUpdateOptions,
} from './interactionmanager/keytiptype';
export type {
    FocusMode,
    FocusModeTransition,
} from './interactionmanager/modecontroller';
import type {
    FocusMode,
    FocusModeOptions,
    FocusModeTransition,
} from './interactionmanager/modecontroller';
import type { KeyPressType } from './interactionmanager/shortcuts';
import type {
    FocusLoop,
    IFocusLoopOptions,
} from './interactionmanager/focustype';

export class InteractionManager extends EventEmitter {
    private isBlurringValue = false;
    private isBlurredValue: boolean;
    private readonly globalKeyboard: GlobalKeyboardCommandController;
    public readonly shortcuts: ShortcutRegistry;
    private readonly navigator: FocusNavigator;
    private readonly windowBridge: WindowBridge;
    private readonly lifecycle: FocusLoopLifecycle;
    private readonly loopRegistry: FocusLoopRegistry;
    private readonly messageRouter: FocusLoopMessageRouter;
    private readonly modes: FocusModeController;
    private readonly input: FocusInputTracker;
    private readonly classifier: FocusElementClassifier;
    private readonly keyboardNavigation: FocusLoopKeyboardNavigation;
    private readonly eventController: FocusLoopEventController;

    private nextFocusIdValue = 0;
    public readonly keyTips: KeyTipController;
    private speechBox: HTMLElement;

    /**
     * Creates the UI manager and installs global focus, keyboard,
     * message, pointer, KeyTip, and shortcut listeners for the current window.
     */
    constructor(desktopMode: boolean) {
        super();

        this.isBlurredValue = document.hasFocus() === false;

        this.input = new FocusInputTracker();
        this.classifier = new FocusElementClassifier();
        this.windowBridge = new WindowBridge(value => this.isBlurringValue = value);
        this.messageRouter = new FocusLoopMessageRouter(this.windowBridge);
        this.shortcuts = new ShortcutRegistry({
            windowBridge: this.windowBridge,
        });
        this.navigator = new FocusNavigator();
        this.loopRegistry = new FocusLoopRegistry({
            controller: {
                activate: (element, options) => this.lifecycle.activate(element, options),
                deactivate: (element, options) => this.lifecycle.deactivate(element, options),
                unregister: (element) => this.lifecycle.remove(element),
            },
            findFocusableElement: this.navigator.findFocusableElement.bind(this.navigator),
        });
        this.modes = new FocusModeController({
            windowBridge: this.windowBridge,
            messageRouter: this.messageRouter,
            getWindowFocusState: () => ({ isBlurring: this.isBlurringValue, isBlurred: this.isBlurredValue }),
        });
        this.modes.on('modeChanged', transition => this.handleFocusModeChanged(transition));
        this.lifecycle = new FocusLoopLifecycle({
            registry: this.loopRegistry,
            input: this.input,
            modes: this.modes,
            navigator: this.navigator,
            classifier: this.classifier,
            isBlurring: () => this.isBlurringValue
        });
        this.keyTips = new KeyTipController({
            classifier: this.classifier,
            lifecycle: this.lifecycle,
            modes: this.modes,
            announce: this.announce.bind(this),
            timeout: ms => new Promise(resolve => setTimeout(resolve, ms)),
        });
        this.globalKeyboard = new GlobalKeyboardCommandController({
            classifier: this.classifier,
            shortcuts: this.shortcuts,
            lifecycle: this.lifecycle,
            modes: this.modes,
            keyTips: this.keyTips,
            windowBridge: this.windowBridge,
            processKeyInActiveModal: this.processKeyInActiveModal.bind(this),
        });
        this.keyboardNavigation = new FocusLoopKeyboardNavigation({
            input: this.input,
            modes: this.modes,
            lifecycle: this.lifecycle,
            registry: this.loopRegistry,
            navigator: this.navigator,
            classifier: this.classifier,
            keyTips: this.keyTips,
            getDirection: () => this.shortcuts.getDirection(),
        });
        this.eventController = new FocusLoopEventController({
            input: this.input,
            lifecycle: this.lifecycle,
        });
        this.loopRegistry.setElementHandlers({
            keyDown: this.keyboardNavigation.keyPressHandler,
            mouseMove: this.eventController.mouseMoveHandler,
        });
        this.registerMessageHandlers();

        if (this.windowBridge.isMainWindow)
            this.createSpeechBox();

        this.installMessageListener();
        this.installGlobalKeyboardListeners(desktopMode);
        this.installFocusListeners();
        this.eventController.installGlobalListeners();

        if (!this.windowBridge.isMainWindow)
            this.shortcuts.updateBaseKeyPaths();
    }

    private createSpeechBox(): void {
        this.speechBox = document.createElement('div');
        this.speechBox.setAttribute('id', 'jmv-speech-box');
        this.speechBox.setAttribute('role', 'region');
        this.speechBox.setAttribute('aria-live', 'polite');
        this.speechBox.setAttribute('aria-atomic', 'false');
        this.speechBox.setAttribute('aria-hidden', 'false');
        this.speechBox.setAttribute('style', 'position: absolute; left: 0px; top: -1px; z-index: -2; opacity: 0;');
        document.body.appendChild(this.speechBox);
    }

    private installMessageListener(): void {
        this.messageRouter.installMessageListener();
    }

    private registerMessageHandlers(): void {
        this.messageRouter.register('setFocusMode', this.modes.set.bind(this.modes));
        this.messageRouter.register('setFocusDefault', this.modes.setDefault.bind(this.modes));
        this.messageRouter.register('speakMessage', this.announce.bind(this));
        this.messageRouter.register('processKeyObj', this.processKeyInActiveModal.bind(this));
        this.messageRouter.register('updateBaseKeyPaths', this.shortcuts.updateBaseKeyPaths.bind(this.shortcuts), 'main');
        this.messageRouter.register('setBaseKeyPaths', this.shortcuts.applyBaseKeyPaths.bind(this.shortcuts), 'child');
    }

    private installGlobalKeyboardListeners(desktopMode: boolean): void {
        this.globalKeyboard.installGlobalListeners(desktopMode);
    }

    private handleFocusModeChanged(transition: FocusModeTransition): void {
        if (this.transitionIncludesKeyTips(transition)) {
            this.keyTips.clearCurrentPath();

            if (this.windowBridge.isMainWindow)
                this.keyTips.update();
        }

        if (!transition.options?.silent)
            this.emit('modeChanged', transition);
    }

    private transitionIncludesKeyTips(transition: FocusModeTransition): boolean {
        return transition.previousMode === 'keyTips' || transition.mode === 'keyTips';
    }

    /**
     * Returns true when the most recent tracked input was a pointer action.
     * Use this to preserve mouse-origin behavior when explicitly activating UI.
     */
    lastInputWasMouse(): boolean {
        return this.input.lastInputWasPointer();
    }

    /**
     * Returns true when an explicit activation request is pending for a loop
     * contained by the supplied element.
     */
    hasActivatingLoopInside(element: HTMLElement): boolean {
        return this.lifecycle.hasActivatingLoopInside(element);
    }

    private installFocusListeners(): void {
        window.addEventListener('focus', event => {
            this.emit('focus', event);
            this.isBlurringValue = false;
            this.isBlurredValue = false;

            if (this.getMode() === 'default' && !this.windowBridge.isMainWindow) {
                this.modes.scheduleFocusModeBroadcast();
            }
        });

        window.addEventListener('blur', event => {
            this.modes.clearDefaultModeReset();
            this.isBlurringValue = false;
            this.isBlurredValue = true;
            this.emit('blur', event);
        });

        if (this.windowBridge.isMainWindow)
            document.addEventListener('visibilitychange', () => this.modes.set('default'));

        window.addEventListener('focusout', event => this.lifecycle.handleFocusOut(event));
    }

    /**
     * Temporarily disables automatic focus restoration while the given element
     * owns an interaction that should manage focus itself.
     */
    pauseFocusRestore(element: HTMLElement): void {
        this.lifecycle.pauseFocusRestore(element);
    }

    /**
     * Re-enables automatic focus restoration after a previous pause.
     */
    resumeFocusRestore(): void {
        this.lifecycle.resumeFocusRestore();
    }

    /**
     * Sends an accessibility announcement through the main window live region.
     * Child windows forward the message to the main window.
     */
    announce(message: string): void {
        if (this.windowBridge.isMainWindow) {
            const msg = document.createElement('div');
            msg.textContent = message;
            if (this.speechBox.childNodes.length > 20)
                this.speechBox.replaceChildren();
            this.speechBox.appendChild(msg);
        }
        else
            this.windowBridge.invoke(this.windowBridge.mainWindow, 'speakMessage', [message], false);
    }

    /**
     * Sets the default control used when focus mode returns to its default
     * target.
     */
    setDefaultFocusControl(defaultFocusControl: HTMLElement): void {
        this.modes.setDefaultFocusControl(defaultFocusControl);
    }

    /**
     * Returns a unique id suitable for aria relationships.
     */
    nextAriaId(prefix: string): string {
        return `${prefix}-${this.nextFocusIdValue++}`;
    }

    /**
     * Returns true when the UI manager is currently in an accessibility-oriented
     * focus mode rather than default mouse-style focus behavior.
     */
    isAccessibilityActive(): boolean {
        return this.modes.inAccessibilityMode();
    }

    /**
     * Transfers focus ownership to another window or iframe.
     */
    transferFocus(otherWindow: Window | HTMLIFrameElement): void {
        this.windowBridge.transferFocus(otherWindow);
    }

    /**
     * Sets the current global focus mode and optionally controls how the mode
     * transition is announced or propagated.
     */
    setMode(value: FocusMode, options?: FocusModeOptions): void {
        this.modes.set(value, options);
    }

    /**
     * Returns the current global focus mode.
     */
    getMode(): FocusMode {
        return this.modes.getMode();
    }

    /**
     * Registers an element as a focus loop and returns the loop handle used for
     * activate/deactivate events and per-loop configuration.
     */
    registerLoop(element: HTMLElement, options: IFocusLoopOptions = {}): FocusLoop {
        return this.loopRegistry.register(element, options);
    }

    /**
     * Gives an item delayed hover focus behavior, optionally running a custom
     * focus action instead of calling focus() directly.
     */
    createHoverItem(item: HTMLElement, focusAction?: () => void): void {
        let focusTimer: ReturnType<typeof setTimeout> | null = null;
        const clearTimer = () => {
            if (focusTimer) {
                clearTimeout(focusTimer);
                focusTimer = null;
            }
        };

        item.addEventListener('click', clearTimer);
        item.addEventListener('mousemove', () => {
            if (item.contains(document.activeElement) || focusTimer)
                return;

            focusTimer = setTimeout(() => {
                if (focusAction)
                    focusAction();
                else
                    item.focus({ preventScroll: true });
                focusTimer = null;
            }, 300);
        });
        item.addEventListener('mouseleave', clearTimer);
    }

    private processKeyInActiveModal(keyObj: KeyPressType): boolean {
        if (this.messageRouter.isFromBroadcast() && !this.windowBridge.isMainWindow)
            return false;

        const modalId = this.lifecycle.activeModal ? this.lifecycle.activeModal.modalId : -1;
        return this.shortcuts.processKey(keyObj, modalId);
    }

    /**
     * Returns the registered loop handle for an element, or throws if the
     * element is not registered as a focus loop.
     */
    getFocusLoop(element: HTMLElement): FocusLoop {
        const loop = this.loopRegistry.findLoop(element);
        if (!loop)
            throw new Error('Element does not have a registered focus loop');
        return loop;
    }

}

const interactionManager = new InteractionManager(false);

export const keyTips = interactionManager.keyTips;
export const shortcuts = interactionManager.shortcuts;

export default interactionManager;
