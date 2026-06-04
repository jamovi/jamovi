import type { FocusElementClassifier } from './classifier';
import type { FocusDirection } from './focusnavigator';
import type { FocusInputTracker } from './input';
import type { FocusLoopLifecycle } from './lifecycle';
import type { FocusNavigator } from './focusnavigator';
import type { FocusModeController } from './modecontroller';
import type { KeyTipController } from './keytipcontroller';
import type { FocusLoop } from './focustype';
import type { FocusLoopRegistry } from './loopregistry';

type FocusLoopKeyboardNavigationDeps = {
    input: FocusInputTracker;
    modes: FocusModeController;
    lifecycle: FocusLoopLifecycle;
    registry: FocusLoopRegistry;
    navigator: FocusNavigator;
    classifier: FocusElementClassifier;
    keyTips: KeyTipController;
    getDirection: () => 'rtl' | 'ltr';
};

export class FocusLoopKeyboardNavigation {
    private readonly input: FocusInputTracker;
    private readonly modes: FocusModeController;
    private readonly lifecycle: FocusLoopLifecycle;
    private readonly registry: FocusLoopRegistry;
    private readonly navigator: FocusNavigator;
    private readonly classifier: FocusElementClassifier;
    private readonly keyTips: KeyTipController;
    private readonly getDirection: () => 'rtl' | 'ltr';
    readonly keyPressHandler: (event: KeyboardEvent) => Promise<void>;

    constructor(deps: FocusLoopKeyboardNavigationDeps) {
        this.input = deps.input;
        this.modes = deps.modes;
        this.lifecycle = deps.lifecycle;
        this.registry = deps.registry;
        this.navigator = deps.navigator;
        this.classifier = deps.classifier;
        this.keyTips = deps.keyTips;
        this.getDirection = deps.getDirection;
        this.keyPressHandler = this.handleKeyPress.bind(this);
    }

    private async handleKeyPress(event: KeyboardEvent): Promise<void> {
        this.input.markKeyboardInput();
        if (this.modes.getMode() === 'default')
            return;

        let target = event.target as HTMLElement;
        if (target.shadowRoot && target.shadowRoot.activeElement)
            target = target.shadowRoot.activeElement as HTMLElement;

        const details = this.classifier.elementFocusDetails(target);
        const reservedKeys = details.requires;
        let loopElement = target.closest('.menu-level') as HTMLElement;
        if (loopElement === null && event.target instanceof HTMLElement && event.target.shadowRoot)
            loopElement = event.target as HTMLElement;
        if (!loopElement)
            return;

        if (loopElement.classList.contains('focus-listener') && loopElement.parentElement) {
            const upperListener = loopElement.parentElement.closest('.focus-listener');
            if (upperListener) {
                loopElement.removeEventListener('keydown', this.keyPressHandler);
                loopElement.classList.remove('focus-listener');
                return;
            }
        }

        const loop = this.registry.findLoop(loopElement);
        if (!loop)
            return;

        const handledExitKey = this.handleExitKey(event, loopElement, loop);
        let keyToEnter = false;

        if (target === loopElement) {
            keyToEnter = loop.keyToEnter;
            if (keyToEnter) {
                loopElement = target.parentElement ? target.parentElement.closest('.menu-level') as HTMLElement : null;
                if (!loopElement)
                    loopElement = target;
            }
        }

        if (reservedKeys && reservedKeys[event.code])
            return;
        if (event.altKey)
            return;

        if (this.modes.getMode() === 'hover')
            this.modes.set('keyboard', { noTransfer: true, silent: false });

        const level = loopElement.getAttribute('fl-level');
        switch (event.code) {
            case 'ArrowUp':
            case 'ArrowDown':
            case 'ArrowLeft':
            case 'ArrowRight':
                this.handleArrowKey(event, target, loopElement, level);
                break;
            case 'Escape':
                if (this.modes.getMode() === 'keyTips') {
                    const keyTipPath = this.keyTips.getCurrentPath();
                    if (keyTipPath.length > 0)
                        this.keyTips.update({ keyTipPath: keyTipPath.slice(0, -1) });
                    else
                        this.modes.set('accessible', { noTransfer: true, silent: false });
                }
                if (!handledExitKey && this.modes.getMode() !== 'keyTips') {
                    setTimeout(() => {
                        this.modes.set('default');
                    }, 0);
                }
                break;
            case 'Tab':
                this.handleTabKey(event, loopElement, target, level);
                break;
            case 'Enter':
                if (keyToEnter) {
                    this.lifecycle.activate(target);
                    event.preventDefault();
                }
                break;
            default:
                if (event.keyCode === 18)
                    return;
                if (this.modes.getMode() === 'keyTips' && event.key.length === 1) {
                    if (await this.keyTips.update({ append: event.key.toUpperCase() })) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }
                break;
        }
    }

    private handleExitKey(event: KeyboardEvent, parent: HTMLElement, loop: FocusLoop): boolean {
        const exitKeys = loop.exitKeys;
        let keyCode = event.code;
        let checkInline: string = null;

        if (keyCode === 'ArrowRight' || keyCode === 'ArrowLeft') {
            if (this.getDirection() === 'rtl')
                checkInline = keyCode === 'ArrowRight' ? 'InlineArrowLeft' : 'InlineArrowRight';
            else
                checkInline = `Inline${keyCode}`;
        }

        if (event.altKey && event.code !== 'Alt') {
            keyCode = `Alt+${keyCode}`;
            if (checkInline)
                checkInline = `Alt+${checkInline}`;
        }
        if (event.ctrlKey && event.code !== 'Ctrl') {
            keyCode = `Ctrl+${keyCode}`;
            if (checkInline)
                checkInline = `Ctrl+${checkInline}`;
        }

        if (exitKeys.includes(keyCode) || (checkInline !== null && exitKeys.includes(checkInline))) {
            const deactivateResult = this.lifecycle.deactivate(parent, { source: 'programmatic' });
            if (deactivateResult === false)
                return false;

            event.preventDefault();
            return true;
        }

        return false;
    }

    private handleArrowKey(event: KeyboardEvent, target: HTMLElement, parent: HTMLElement, level: string): void {
        if (this.modes.getMode() === 'keyTips')
            this.modes.set('accessible', { noTransfer: true, silent: false });

        const direction = this.arrowCodeToDirection(event.code);
        if (target === parent) {
            this.lifecycle.activate(parent, { withMouse: false, direction });
            return;
        }

        const loopSelector = direction === 'up' || direction === 'down' ? '[vloop="true"]' : '[hloop="true"]';
        const loopContainer = target.closest(loopSelector) ?? parent;
        const list = this.navigator.keyboardfocusableElements(loopContainer, level);
        if (this.navigator.findNextElement(target, list, direction)) {
            event.preventDefault();
            event.stopPropagation();
        }
    }

    private arrowCodeToDirection(code: string): FocusDirection {
        switch (code) {
            case 'ArrowUp':
                return 'up';
            case 'ArrowDown':
                return 'down';
            case 'ArrowLeft':
                return 'left';
            default:
                return 'right';
        }
    }

    private handleTabKey(event: KeyboardEvent, parent: HTMLElement, target: HTMLElement, level: string): void {
        if (this.modes.getMode() === 'keyTips')
            this.modes.set('accessible', { noTransfer: true, silent: false });

        const list = this.navigator.keyboardfocusableElements(parent, level, true);
        const index = list.indexOf(target);
        let newFocus: HTMLElement = null;

        if (event.shiftKey) {
            newFocus = list[index - 1];
            if (!newFocus)
                newFocus = list[list.length - 1];
        }
        else {
            newFocus = list[index + 1];
            if (!newFocus)
                newFocus = list[0];
        }

        if (newFocus)
            newFocus.focus();
        else
            parent.focus();

        event.preventDefault();
        event.stopPropagation();
    }
}
