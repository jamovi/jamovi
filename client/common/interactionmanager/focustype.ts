import type { FocusMode } from './modecontroller';
import { FocusLoop } from './focusloop';

export interface IFocusLoopActivateOptions {
    withMouse?: boolean;
    direction?: 'up' | 'down' | 'left' | 'right';
    exitSelector?: string | WeakRef<HTMLElement> | HTMLElement;
    closeFocusMode?: FocusMode;
}

export interface IFocusLoopOptions {
    level?: number;
    hoverFocus?: boolean;
    exitSelector?: string | WeakRef<HTMLElement> | HTMLElement;
    closeFocusMode?: FocusMode;
    keyToEnter?: boolean;
    modal?: boolean;
    exitKeys?: string[];
    allowKeyPaths?: boolean;
    needsDeactivate?: boolean;
}

export type FocusLoopDeactivateCause = 'mouse' | 'programmatic' | 'focus-transfer';

export interface IFocusLoopDeactivateOptions {
    source: FocusLoopDeactivateCause;
}

export type FocusLoopController = {
    activate(element: HTMLElement, options?: IFocusLoopActivateOptions): void;
    deactivate(element: HTMLElement, options?: IFocusLoopDeactivateOptions): boolean;
    unregister(element: HTMLElement): void;
};

export interface IFocusLoopDeactivateEvent {
    cancel: boolean;
    canCancel: boolean;
    passFocus: boolean;
    withMouse: boolean;
    reason: FocusLoopDeactivateCause;
}

export type FocusLoopDeactivateReason = 'inactive' | 'already-deactivating' | 'cancelled';

export type FocusLoopDeactivateResult =
    | { deactivated: false, reason: FocusLoopDeactivateReason }
    | { deactivated: true, focusPassed: boolean, exitElementFound: boolean };

export type FocusLoopState = 'registered' | 'activating' | 'active' | 'deactivating' | 'removed';

export type FocusLoopActivationOptions = {
    closeFocusMode?: FocusMode;
    exitSelector?: string | WeakRef<HTMLElement> | HTMLElement;
};

export { FocusLoop };
