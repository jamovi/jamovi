import type { FocusInputTracker } from './input';
import type { FocusLoopLifecycle } from './lifecycle';

type FocusLoopEventDeps = {
    input: FocusInputTracker;
    lifecycle: FocusLoopLifecycle;
};

export class FocusLoopEventController {
    private readonly input: FocusInputTracker;
    private readonly lifecycle: FocusLoopLifecycle;
    readonly mouseMoveHandler: (event: MouseEvent) => void;

    constructor(deps: FocusLoopEventDeps) {
        this.input = deps.input;
        this.lifecycle = deps.lifecycle;
        this.mouseMoveHandler = this.handleMouseMove.bind(this);
    }

    installGlobalListeners(): void {
        window.addEventListener('pointerdown', event => this.handlePointerDown(event));
        window.addEventListener('focusin', event => this.handleFocusIn(event));
    }

    handleMouseMove(_event: MouseEvent): void {
        this.lifecycle.reconcilePointerMove();
    }

    private handlePointerDown(event: PointerEvent): void {
        this.input.markPointerInput();
        this.lifecycle.reconcilePointerDown(event.target as Element);
    }

    private handleFocusIn(event: FocusEvent): void {
        this.lifecycle.handleFocusIn(event.target as HTMLElement, event.composedPath(), event.relatedTarget as HTMLElement | null);
    }
}
