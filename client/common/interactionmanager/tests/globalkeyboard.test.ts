import { describe, expect, it, vi } from 'vitest';

import { GlobalKeyboardCommandController } from '../globalkeyboard';

function createController(allowsKeyPaths: boolean) {
    const modes = {
        getMode: vi.fn(() => 'default'),
        set: vi.fn(),
        getDefaultFocusControl: vi.fn(() => null),
    };
    const keyTips = {
        clearCurrentPath: vi.fn(),
        appendKey: vi.fn(),
    };
    const controller = new GlobalKeyboardCommandController({
        classifier: { activeElementIsEditableTextbox: () => false } as any,
        shortcuts: { eventToKeyObj: () => ({}), hasBaseKeyPath: () => false } as any,
        lifecycle: { activeModalAllowsKeyPaths: () => allowsKeyPaths } as any,
        modes: modes as any,
        keyTips: keyTips as any,
        windowBridge: { isMainWindow: true, broadcast: vi.fn() } as any,
        processKeyInActiveModal: () => false,
    });

    return { controller, modes, keyTips };
}

function altKeyEvent(): KeyboardEvent {
    return {
        key: 'Alt',
        code: 'AltLeft',
        keyCode: 18,
        altKey: true,
        ctrlKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
    } as unknown as KeyboardEvent;
}

describe('GlobalKeyboardCommandController', () => {

    it('consumes Alt and opens key tips when the active modal allows key paths', () => {
        const { controller, modes } = createController(true);
        const down = altKeyEvent();
        const up = altKeyEvent();

        controller['handleBrowserKeyDown'](down);
        controller['handleBrowserKeyUp'](up);

        expect(up.preventDefault).toHaveBeenCalled();
        expect(modes.set).toHaveBeenCalledWith('keyTips');
    });

    it('still consumes Alt when the active modal declines key paths', () => {
        const { controller, modes } = createController(false);
        const down = altKeyEvent();
        const up = altKeyEvent();

        controller['handleBrowserKeyDown'](down);
        controller['handleBrowserKeyUp'](up);

        // Consumed, so the browser does not put focus on its own menu bar.
        expect(up.preventDefault).toHaveBeenCalled();
        expect(up.stopPropagation).toHaveBeenCalled();
        // But no key tips, which is what declining key paths asks for.
        expect(modes.set).not.toHaveBeenCalled();
    });

    it('consumes Alt in desktop mode when the active modal declines key paths', () => {
        const { controller, keyTips } = createController(false);
        const down = altKeyEvent();

        controller['handleDesktopKeyDown'](down);

        expect(down.preventDefault).toHaveBeenCalled();
        expect(keyTips.clearCurrentPath).not.toHaveBeenCalled();
    });

    it('does not treat a modified Alt combination as a key tip press', () => {
        const { controller, modes } = createController(true);
        const down = { ...altKeyEvent(), key: 'S', code: 'KeyS' } as unknown as KeyboardEvent;
        const up = altKeyEvent();

        controller['handleBrowserKeyDown'](down);
        controller['handleBrowserKeyUp'](up);

        expect(up.preventDefault).not.toHaveBeenCalled();
        expect(modes.set).not.toHaveBeenCalled();
    });
});
