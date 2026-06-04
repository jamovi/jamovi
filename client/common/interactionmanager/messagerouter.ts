import type { WindowBridge } from './windowbridge';

export type FocusLoopMessageHandler = (...args: any[]) => void;

type FocusLoopMessageTarget = 'all' | 'main' | 'child';

type FocusLoopMessageRegistration = {
    handler: FocusLoopMessageHandler;
    target: FocusLoopMessageTarget;
};

export class FocusLoopMessageRouter {
    private windowBridge: WindowBridge;
    private handlers: { [key: string]: FocusLoopMessageRegistration } = {};
    private fromBroadcast = false;

    constructor(windowBridge: WindowBridge) {
        this.windowBridge = windowBridge;
    }

    register(id: string, handler: FocusLoopMessageHandler, target: FocusLoopMessageTarget = 'all'): void {
        this.handlers[id] = { handler, target };
    }

    installMessageListener(): void {
        window.addEventListener('message', event => {
            const data = event.data;
            if (event.source === window || data.type !== 'focusLoop')
                return;

            const registration = this.handlers[data.id];
            if (!registration || !this.shouldHandle(registration.target))
                return;

            this.setFromBroadcast(true);
            try {
                const args = Array.isArray(data.args) ? data.args : [];
                registration.handler(...args);
            }
            finally {
                this.setFromBroadcast(false);
            }
        });
    }

    setFromBroadcast(value: boolean): void {
        this.fromBroadcast = value;
    }

    isFromBroadcast(): boolean {
        return this.fromBroadcast;
    }

    private shouldHandle(target: FocusLoopMessageTarget): boolean {
        return target === 'all'
            || (target === 'main' && this.windowBridge.isMainWindow)
            || (target === 'child' && !this.windowBridge.isMainWindow);
    }
}
