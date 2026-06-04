export class WindowBridge {
    readonly isMainWindow: boolean;
    readonly mainWindow: Window;

    private setBlurring: (value: boolean) => void;

    constructor(setBlurring: (value: boolean) => void) {
        this.setBlurring = setBlurring;
        this.isMainWindow = window.document.querySelector('body#main-window') !== null;
        this.mainWindow = this.isMainWindow ? window : window.parent;
    }

    transferFocus(otherWindow: Window | HTMLIFrameElement): void {
        this.setBlurring(true);
        otherWindow.focus();
        if (otherWindow !== this.mainWindow && otherWindow instanceof HTMLIFrameElement && otherWindow.contentWindow) {
            setTimeout(() => {
                otherWindow.contentWindow.focus();
            }, 100);
        }
    }

    invoke(invokeWindow: Window, id: string, args: any[], transferFocus: boolean): void {
        if (invokeWindow === window)
            throw new Error('Cannot invoke in the same window that was called from');

        if (transferFocus)
            this.transferFocus(invokeWindow);
        invokeWindow.postMessage({ id, args, type: 'focusLoop' }, '*');
    }

    broadcast(id: string, args: any[], transferFocus: boolean): void {
        const data = { id, args, type: 'focusLoop' };
        if (!this.isMainWindow && transferFocus)
            this.transferFocus(this.mainWindow);

        if (!this.isMainWindow)
            this.mainWindow.postMessage(data, '*');

        for (let i = 0; i < this.mainWindow.frames.length; i++) {
            if (window !== this.mainWindow.frames[i])
                this.mainWindow.frames[i].postMessage(data, '*');
        }
    }
}
