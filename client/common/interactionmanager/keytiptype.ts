import { KeyTipToken } from './keytiptoken';

export interface IKeyTipUpdateOptions {
    keyTipPath?: string;
    silent?: boolean;
    retries?: number;
    keyCount?: number;
    lastActionableKeyTip?: KeyTipToken;
    append?: string;
}

export interface IKeyTipActionEvent {
    target: HTMLElement;
    currentTarget: HTMLElement;
    _defaultPrevented: boolean;
    preventDefault: () => boolean;
}

export interface IKeyTipTokenOptions {
    key: string;
    action?: (event?: IKeyTipActionEvent) => void;
    path?: string;
    label?: string;
    blocking?: boolean;
    position?: { x: string, y: string, internal?: boolean };
    maintainAccessibility?: boolean;
}

export { KeyTipToken };
