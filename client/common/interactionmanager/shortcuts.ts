import type { WindowBridge } from './windowbridge';

export type KeyPressInfo = {
    handle: () => void | boolean;
    description: string;
    modalId: number;
    modalSpecific: boolean;
};

export type KeyPressType = {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    key: string;
};

type KeyHandlerTree = {
    Ctrl?: ModifierBranch;
    '-'?: ModifierBranch;
};

type ModifierBranch = {
    Alt?: ShiftBranch;
    '-'?: ShiftBranch;
};

type ShiftBranch = {
    Shift?: { [key: string]: KeyPressInfo };
    '-'?: { [key: string]: KeyPressInfo };
};

type ShortcutRegistryDeps = {
    windowBridge: WindowBridge;
};

export class ShortcutRegistry {
    private readonly windowBridge: WindowBridge;
    private direction: 'rtl' | 'ltr' = 'ltr';
    private handlers: KeyHandlerTree;
    private commandDescriptions: { [key: string]: string };
    private mainWindowCommandDescriptions: { [key: string]: string };

    constructor(deps: ShortcutRegistryDeps) {
        this.windowBridge = deps.windowBridge;
    }

    getDirection(): 'rtl' | 'ltr' {
        return this.direction;
    }

    setDirection(dir: 'rtl' | 'ltr'): void {
        this.direction = dir;

        if (this.windowBridge.isMainWindow)
            this.updateBaseKeyPaths();
    }

    updateBaseKeyPaths(): void {
        if (this.windowBridge.isMainWindow)
            this.windowBridge.broadcast('setBaseKeyPaths', [this.commandDescriptions, this.direction], false);
        else
            this.windowBridge.broadcast('updateBaseKeyPaths', [], false);
    }

    applyBaseKeyPaths(keyPaths: { [key: string]: string }, dir: 'rtl' | 'ltr'): void {
        if (this.windowBridge.isMainWindow)
            return;

        this.setDirection(dir);
        this.mainWindowCommandDescriptions = keyPaths;
    }

    hasBaseKeyPath(keyObj: KeyPressType): boolean {
        return !!this.mainWindowCommandDescriptions && this.keyObjToKeyPath(keyObj) in this.mainWindowCommandDescriptions;
    }

    register(keyPath: string, handle: () => void | boolean, description: string, modalSpecific = true, modalId = -1): void {
        const keyObj = this.keyPathToKeyObj(keyPath);
        keyPath = this.keyObjToKeyPath(keyObj);

        if (!this.commandDescriptions)
            this.commandDescriptions = {};
        this.commandDescriptions[keyPath] = description;

        if (!this.handlers)
            this.handlers = {};

        const ctrlHandles = this.ensureBranch(this.handlers, keyObj.ctrlKey ? 'Ctrl' : '-');
        const altHandles = this.ensureBranch(ctrlHandles, keyObj.altKey ? 'Alt' : '-');
        const shiftHandles = this.ensureBranch(altHandles, keyObj.shiftKey ? 'Shift' : '-');

        shiftHandles[keyObj.key] = { handle, description, modalId, modalSpecific };

        if (this.windowBridge.isMainWindow)
            this.updateBaseKeyPaths();
    }

    eventToKeyObj(event: KeyboardEvent): KeyPressType {
        return {
            ctrlKey: event.ctrlKey || event.metaKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            key: event.code ? event.code.toLowerCase() : event.code,
        };
    }

    keyPathToKeyObj(keyPath: string): KeyPressType {
        const keys = keyPath.split('+');
        return {
            ctrlKey: keys.includes('Ctrl'),
            altKey: keys.includes('Alt'),
            shiftKey: keys.includes('Shift'),
            key: keys[keys.length - 1].toLowerCase(),
        };
    }

    keyObjToKeyPath(keyObj: KeyPressType): string {
        const list: string[] = [];
        if (keyObj.ctrlKey)
            list.push('Ctrl');
        if (keyObj.altKey)
            list.push('Alt');
        if (keyObj.shiftKey)
            list.push('Shift');
        list.push(keyObj.key);
        return list.join('+');
    }

    processKey(keyObj: KeyPressType, activeModalId: number): boolean {
        const ctrlHandles = this.handlers && this.handlers[keyObj.ctrlKey ? 'Ctrl' : '-'];
        const altHandles = ctrlHandles && ctrlHandles[keyObj.altKey ? 'Alt' : '-'];
        const shiftHandles = altHandles && altHandles[keyObj.shiftKey ? 'Shift' : '-'];
        const handleInfo = shiftHandles && shiftHandles[keyObj.key];
        if (!handleInfo)
            return false;

        if (!handleInfo.modalSpecific || handleInfo.modalId === activeModalId)
            return handleInfo.handle() !== false;

        return false;
    }

    private ensureBranch(parent: any, key: string): any {
        if (!parent[key])
            parent[key] = {};
        return parent[key];
    }
}
