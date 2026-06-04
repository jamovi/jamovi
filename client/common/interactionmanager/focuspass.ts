export class FocusPassController {
    private passing = false;
    private target: HTMLElement | null = null;

    prepare(element: HTMLElement, shouldPassFocus: boolean): boolean {
        this.clear();
        this.passing = shouldPassFocus;
        this.target = shouldPassFocus ? element : null;
        return this.passing;
    }

    complete(): boolean {
        if (!this.passing || !this.target)
            return false;

        const element = this.target;
        element.focus();

        if (document.activeElement !== element)
            this.clear();

        return true;
    }

    clear(): void {
        this.passing = false;
        this.target = null;
    }

    isTarget(element: HTMLElement): boolean {
        return element === this.target;
    }

    isPassing(): boolean {
        return this.passing;
    }
}
