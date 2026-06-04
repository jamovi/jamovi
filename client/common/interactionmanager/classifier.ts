export interface IElementFocusDetails {
    keyTipKey: string;
    usesKeyboard: boolean;
    isFocusController: boolean;
    requires: { [key: string]: boolean } | null;
    containsKeyTips: boolean;
}

export class FocusElementClassifier {
    activeElementIsEditableTextbox(defaultFocusControl: HTMLElement | null): boolean {
        let isEditable = (document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text')
            || (document.activeElement instanceof HTMLElement && document.activeElement.isContentEditable);

        if (isEditable && document.activeElement instanceof HTMLElement && document.activeElement.classList.contains('has-editing-mode'))
            isEditable = !!defaultFocusControl && defaultFocusControl.classList.contains('editing');

        return isEditable;
    }

    elementFocusDetails(element: Element): IElementFocusDetails {
        const value: IElementFocusDetails = {
            keyTipKey: element.getAttribute('keytip-key'),
            usesKeyboard: element.closest('[aria-haspopup="true"]') !== null,
            isFocusController: false,
            requires: null,
            containsKeyTips: false,
        };

        value.containsKeyTips = element.querySelectorAll('[keytip-key]').length > 0 || !!value.keyTipKey;

        if (element.tagName === 'INPUT') {
            const elementType = element.getAttribute('type');
            if (elementType === null || elementType === '' || elementType === 'text' || elementType === 'search') {
                value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false };
                value.usesKeyboard = true;
            }
        }
        else if (element.tagName === 'TEXTAREA') {
            value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false };
            value.usesKeyboard = true;
        }
        else if (element.tagName === 'SELECT') {
            value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: true, ArrowDown: true, Escape: false, Tab: false };
            value.usesKeyboard = true;
        }
        else if (element.getAttribute('aria-haspopup')) {
            value.isFocusController = true;
            value.requires = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false, Enter: true, Space: true };
            value.usesKeyboard = true;
        }
        else if (element.classList.contains('menu-level')) {
            value.isFocusController = true;
            value.requires = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false };
            value.usesKeyboard = true;
        }
        else if (element.classList.contains('selectable-list')) {
            value.isFocusController = true;
            value.requires = { ArrowLeft: false, ArrowRight: false, ArrowUp: true, ArrowDown: true, Escape: false, Tab: false };
            value.usesKeyboard = true;
        }
        else if (element instanceof HTMLElement && element.isContentEditable) {
            value.isFocusController = true;
            value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: true, ArrowDown: true, Escape: false, Tab: false, Enter: true, Space: true };
            value.usesKeyboard = true;
        }

        return value;
    }

    containsFocusableMenuLevel(elementPath: EventTarget[]): boolean {
        for (const element of elementPath) {
            if (element instanceof HTMLElement && element.classList.contains('menu-level') && element.hasAttribute('tabindex'))
                return true;
            if (element === document.body)
                return false;
        }
        return false;
    }
}
