import { describe, expect, it, vi } from 'vitest';

import { FocusLoop } from '../focusloop';
import { FakeElement } from './helpers';

describe('FocusLoop', () => {
    it('activates its registered element through the lifecycle controller', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);

        loop.activate({ withMouse: true });

        expect(controller.activate).toHaveBeenCalledWith(element, { withMouse: true });
    });

    it('deactivates its registered element through the lifecycle controller', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(() => true),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);

        const result = loop.deactivate({ source: 'programmatic' });

        expect(controller.deactivate).toHaveBeenCalledWith(element, { source: 'programmatic' });
        expect(result).toBe(true);
    });

    it('unregisters its registered element through the lifecycle controller', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);

        loop.unregister();

        expect(controller.unregister).toHaveBeenCalledWith(element);
    });

    it('throws when activating a removed loop handle', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);
        loop.state = 'removed';

        expect(() => loop.activate()).toThrow('Cannot use a removed focus loop');
        expect(controller.activate).not.toHaveBeenCalled();
    });

    it('throws when deactivating a removed loop handle', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);
        loop.state = 'removed';

        expect(() => loop.deactivate()).toThrow('Cannot use a removed focus loop');
        expect(controller.deactivate).not.toHaveBeenCalled();
    });

    it('throws when unregistering a removed loop handle', () => {
        const element = new FakeElement() as unknown as HTMLElement;
        const controller = {
            activate: vi.fn(),
            deactivate: vi.fn(),
            unregister: vi.fn(),
        };
        const loop = new FocusLoop(element, {}, -1, controller);
        loop.state = 'removed';

        expect(() => loop.unregister()).toThrow('Cannot use a removed focus loop');
        expect(controller.unregister).not.toHaveBeenCalled();
    });
});
