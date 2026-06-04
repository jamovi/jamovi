export class FocusInputTracker {
    private lastInputPointer = false;

    markPointerInput(): void {
        this.lastInputPointer = true;
    }

    markKeyboardInput(): void {
        this.lastInputPointer = false;
    }

    lastInputWasPointer(): boolean {
        return this.lastInputPointer;
    }
}
