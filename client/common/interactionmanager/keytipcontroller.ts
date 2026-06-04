import type { FocusElementClassifier } from './classifier';
import type { FocusLoopLifecycle } from './lifecycle';
import type { FocusModeController } from './modecontroller';
import { KeyTipToken } from './keytiptoken';
import type { IKeyTipActionEvent, IKeyTipTokenOptions, IKeyTipUpdateOptions } from './keytiptype';

type KeyTipControllerDeps = {
    classifier: FocusElementClassifier;
    lifecycle: FocusLoopLifecycle;
    modes: FocusModeController;
    announce(message: string): void;
    timeout(ms: number): Promise<void>;
};

export class KeyTipController {
    private tokens = new WeakMap<HTMLElement, KeyTipToken>();
    private path = '';
    private readonly classifier: FocusElementClassifier;
    private readonly lifecycle: FocusLoopLifecycle;
    private readonly modes: FocusModeController;
    private readonly announce: (message: string) => void;
    private readonly timeout: (ms: number) => Promise<void>;

    constructor(deps: KeyTipControllerDeps) {
        this.classifier = deps.classifier;
        this.lifecycle = deps.lifecycle;
        this.modes = deps.modes;
        this.announce = deps.announce;
        this.timeout = deps.timeout;
    }

    getCurrentPath(): string {
        return this.path;
    }

    private setCurrentPath(path: string): void {
        if (path === this.path)
            return;
        this.path = path;
    }

    clearCurrentPath(): void {
        this.setCurrentPath('');
    }

    appendKey(value: string): void {
        this.setCurrentPath(this.path + value);
    }

    register(element: HTMLElement, options: Partial<IKeyTipTokenOptions>): KeyTipToken;
    register(element: HTMLElement, options: IKeyTipTokenOptions): KeyTipToken {
        let token = this.tokens.get(element);
        if (!token) {
            token = new KeyTipToken(options);
            this.tokens.set(element, token);
        }
        else {
            if (token.action && options.action)
                token.off('keytip-action', token.action);
            Object.assign(token, options);
        }

        if (token.key === undefined)
            throw new Error('All KeyTips need at least "key" specified.');
        if (token.key.indexOf('-') >= 0)
            throw new Error(`The key can't have a '-' in it.`);

        token.fullPath = token.path ? `${token.path}${token.key}` : token.key;
        element.setAttribute('keytip-key', token.key);
        if (options.path)
            element.setAttribute('keytip-path', token.fullPath);

        if (options.action) {
            if (token.label) {
                const action = token.action;
                token.action = event => {
                    this.announce(token.label);
                    action(event);
                };
            }
            token.on('keytip-action', token.action);
        }

        return token;
    }

    async update(options: IKeyTipUpdateOptions = {}): Promise<boolean> {
        const retries = options.retries ?? 0;
        let keyTipPath = options.keyTipPath ?? this.path;
        const silent = options.silent ?? false;
        if (options.append)
            keyTipPath += options.append;

        const baseElement = this.lifecycle.activeModalElement || document;
        if (this.modes.getMode() !== 'keyTips') {
            this.clearLabels();
            return false;
        }

        const match = this.findMatches(baseElement, keyTipPath);
        if (match.actionableElement || match.elements.length > 0)
            options.retries = 0;

        if (match.actionableElement && !silent)
            this.invokeAction(match.actionableElement, match.actionableToken);

        if (match.actionableToken && match.actionableToken.blocking)
            return false;

        if (match.elements.length === 0) {
            if (retries < 4) {
                await this.timeout(50);
                return this.update({
                    keyTipPath,
                    silent: true,
                    retries: retries + 1,
                    keyCount: match.elements.length,
                    lastActionableKeyTip: options.lastActionableKeyTip ?? match.actionableToken,
                });
            }

            if (match.actionableElement) {
                const details = this.classifier.elementFocusDetails(match.actionableElement);
                if (match.actionableToken.maintainAccessibility || details.usesKeyboard) {
                    this.modes.set('accessible');
                    if (!details.isFocusController)
                        match.actionableElement.focus();
                }
                else {
                    this.modes.set('default');
                }
            }
            else if (!options.lastActionableKeyTip) {
                return false;
            }
        }

        this.clearLabels();

        this.setCurrentPath(keyTipPath);

        for (const element of match.elements)
            this.createLabel(element, keyTipPath);

        return true;
    }

    private findMatches(baseElement: Document | HTMLElement, keyTipPath: string): { elements: HTMLElement[], actionableElement: HTMLElement, actionableToken: KeyTipToken } {
        let filter = `[keytip-key]:not([keytip-path])`;
        if (keyTipPath)
            filter = `[keytip-path^="${keyTipPath}"], [keytip-key|="${keyTipPath}"]:not([keytip-path])`;

        let actionableElement: HTMLElement = null;
        let actionableToken: KeyTipToken = null;

        const elements = [...baseElement.querySelectorAll<HTMLElement>(filter)].filter(el => {
            if (el.offsetWidth <= 0 || el.offsetHeight <= 0 || el.getAttribute('aria-hidden') || window.getComputedStyle(el).visibility === 'hidden')
                return false;

            const path = el.getAttribute('keytip-path');
            const display = el.getAttribute('keytip-key');
            if (path === keyTipPath || (path === null && display === keyTipPath)) {
                actionableElement = el;
                actionableToken = this.tokens.get(actionableElement);
                return false;
            }

            if (path && path !== keyTipPath) {
                for (let i = 1; i <= display.length; i++) {
                    if (path.slice(0, -i) === keyTipPath)
                        return true;
                }
                return false;
            }

            return true;
        });

        return { elements, actionableElement, actionableToken };
    }

    private invokeAction(actionableElement: HTMLElement, actionableToken: KeyTipToken): void {
        if (actionableToken) {
            const event: IKeyTipActionEvent = {
                target: actionableElement,
                currentTarget: actionableElement,
                _defaultPrevented: false,
                preventDefault: undefined,
            };
            event.preventDefault = () => event._defaultPrevented = true;
            actionableToken.emit('keytip-action', event);
        }
        else {
            actionableElement.dispatchEvent(new Event('keytip-action', { cancelable: true }));
        }
    }

    private clearLabels(): void {
        for (const keyLabel of document.querySelectorAll('.keytip-key-tag'))
            keyLabel.remove();
    }

    private createLabel(element: HTMLElement, keyTipPath: string): void {
        let key: string;
        let display: string;
        let path: string;
        let position = { x: '50%', y: '75%', internal: false };

        const info = this.tokens.get(element);
        if (!info) {
            path = element.getAttribute('keytip-path');
            key = element.getAttribute('keytip-key');
        }
        else {
            path = info.fullPath;
            key = info.key;
            if (info.position)
                position = { ...position, ...info.position };
        }

        if (path) {
            const length = path.length - keyTipPath.length;
            display = key.slice(key.length - length);
        }
        else {
            display = key;
        }

        const keyTipElement = document.createElement('div');
        keyTipElement.classList.add('keytip-key-tag');
        keyTipElement.setAttribute('aria-hidden', 'true');
        keyTipElement.textContent = display;

        const rect = element.getBoundingClientRect();
        const point = this.resolveLabelPoint(rect, position);
        keyTipElement.style.top = `${point.y}px`;
        keyTipElement.style.left = `${point.x}px`;

        if (position.internal)
            element.append(keyTipElement);
        else
            document.body.append(keyTipElement);
    }

    private resolveLabelPoint(rect: DOMRect, position: { x: string, y: string, internal?: boolean }): { x: number, y: number } {
        let rectX = rect.left;
        let rectY = rect.top;
        const offset = { x: 15, y: 15 };

        if (position.internal) {
            rectX = 0;
            rectY = 0;
        }

        const y = this.parsePositionUnit(position.y, rect.height);
        const x = this.parsePositionUnit(position.x, rect.width);

        if (!position.internal && y > 0.5)
            offset.y = 0;
        else if (position.internal && y < 0.5)
            offset.y = 0;
        else if (y === 0.5)
            offset.y = offset.y / 2;

        if (!position.internal && x > 0.5)
            offset.x = 0;
        else if (position.internal && x < 0.5)
            offset.x = 0;
        else if (x === 0.5)
            offset.x = offset.x / 2;

        return {
            x: rectX + (rect.width * x) - offset.x,
            y: rectY + (rect.height * y) - offset.y,
        };
    }

    private parsePositionUnit(value: string, size: number): number {
        if (value.endsWith('%'))
            return parseFloat(value) / 100;
        if (value.endsWith('px'))
            return parseFloat(value) / size;
        throw new Error('Must specify units for position');
    }
}
