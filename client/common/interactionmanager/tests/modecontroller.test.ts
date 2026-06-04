import { describe, expect, it, vi } from 'vitest';

import { FocusModeController } from '../modecontroller';
import { installFakeDom } from './helpers';

describe('FocusModeController', () => {
    it('emits modeChanged with the full transition', () => {
        installFakeDom();

        const windowBridge = {
            broadcast: vi.fn(),
        };
        const messageRouter = {
            isFromBroadcast: vi.fn(() => false),
        };
        const modes = new FocusModeController({
            windowBridge: windowBridge as any,
            messageRouter: messageRouter as any,
            getWindowFocusState: () => ({ isBlurring: false, isBlurred: false }),
        });
        const modeChanged = vi.fn();

        modes.on('modeChanged', modeChanged);
        modes.set('keyboard', { silent: true });

        expect(modeChanged).toHaveBeenCalledWith({
            previousMode: 'default',
            mode: 'keyboard',
            options: { silent: true },
            fromBroadcast: false,
        });
    });
});
