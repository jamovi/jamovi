export type FocusDirection = 'up' | 'down' | 'left' | 'right';

export class FocusNavigator {
    findFocusableElement(element: HTMLElement): void {
        const parent = element.closest('.menu-level') as HTMLElement;
        if (parent) {
            const list = this.keyboardfocusableElements(parent, parent.getAttribute('fl-level'), true);
            if (list.length > 0)
                list[0].focus();
        }
        else {
            element.focus();
        }
    }

    keyboardfocusableElements(element: Element | DocumentFragment, level: string, onlyTabbable = false): HTMLElement[] {
        if (element instanceof Element && element.shadowRoot)
            element = element.shadowRoot;

        const tabbable = onlyTabbable ? ':not([tabindex="-1"])' : '';
        const nextLevel = parseInt(level) + 1;
        const list = [...element.querySelectorAll<HTMLElement>(`
        a[href]${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        button${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        input${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        textarea${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        select${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        details${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *),
        [tabindex]${tabbable}:not(.menu-level[fl-level="${nextLevel}"] *):not(.not-focusable *)`)]
            .filter(el => (el.hasAttribute('ignore-focus-size') || (el.offsetWidth > 0 && el.offsetHeight > 0)) && !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden') && window.getComputedStyle(el).visibility !== 'hidden');

        if (onlyTabbable) {
            list.sort((a, b) => {
                const aIndexValue = a.getAttribute('tabindex');
                const bIndexValue = b.getAttribute('tabindex');
                const aIndex = aIndexValue === null ? 0 : parseInt(aIndexValue);
                const bIndex = bIndexValue === null ? 0 : parseInt(bIndexValue);

                if (aIndex === bIndex)
                    return 0;
                if (aIndex === null || aIndex === 0)
                    return 1;
                if (bIndex === null || bIndex === 0)
                    return -1;
                return aIndex - bIndex;
            });
        }

        return list;
    }

    findBoundingRectangle(element: HTMLElement): DOMRect {
        if (element.parentElement && element.parentElement.tagName === 'LABEL')
            element = element.parentElement;
        return element.getBoundingClientRect();
    }

    findNextElement(target: HTMLElement, list: HTMLElement[], direction: FocusDirection): boolean {
        const targetRect = this.findBoundingRectangle(target);
        let closestDistance: number = null;
        let closestElement: HTMLElement = null;
        let closestStraightDistance: number = null;
        let closestStraightElement: HTMLElement = null;
        let furthestStraightDistance: number = null;
        let furthestStraightElement: HTMLElement = null;

        for (const candidateElement of list) {
            if (candidateElement.contains(target) || target.contains(candidateElement) || candidateElement.classList.contains(`block-focus-${direction}`))
                continue;

            const candidate = this.measureCandidate(targetRect, candidateElement, direction);
            if (!candidate.valid)
                continue;

            if (candidate.directionDistance < 0) {
                if (candidate.perpendicularDistance === 0 && (furthestStraightElement === null || candidate.distanceSquared > furthestStraightDistance)) {
                    furthestStraightDistance = candidate.distanceSquared;
                    furthestStraightElement = candidateElement;
                }
                continue;
            }

            if (candidate.perpendicularDistance === 0 && (closestStraightElement === null || candidate.distanceSquared < closestStraightDistance)) {
                closestStraightDistance = candidate.distanceSquared;
                closestStraightElement = candidateElement;
            }

            if (closestElement === null || candidate.distanceSquared < closestDistance) {
                closestDistance = candidate.distanceSquared;
                closestElement = candidateElement;
            }
        }

        const next = closestStraightElement || closestElement || furthestStraightElement;
        if (!next)
            return false;

        next.focus();
        return true;
    }

    private measureCandidate(targetRect: DOMRect, candidateElement: HTMLElement, direction: FocusDirection): {
        valid: boolean,
        directionDistance: number,
        perpendicularDistance: number,
        distanceSquared: number,
    } {
        const candidateRect = this.findBoundingRectangle(candidateElement);
        const targetLocation = {
            cx: targetRect.left + ((targetRect.right - targetRect.left) / 2),
            cy: targetRect.top + ((targetRect.bottom - targetRect.top) / 2),
            ratio: targetRect.height / targetRect.width,
            x: 0,
            y: 0,
        };
        const candidateLocation = { x: 0, y: 0 };

        this.alignHorizontalEdges(targetRect, candidateRect, targetLocation, candidateLocation);
        this.alignVerticalEdges(targetRect, candidateRect, targetLocation, candidateLocation);

        let directionDistance = -1;
        switch (direction) {
            case 'up':
                candidateLocation.y = candidateRect.bottom;
                directionDistance = targetLocation.y - candidateLocation.y;
                break;
            case 'down':
                candidateLocation.y = candidateRect.top;
                directionDistance = candidateLocation.y - targetLocation.y;
                break;
            case 'left':
                candidateLocation.x = candidateRect.right;
                directionDistance = targetLocation.x - candidateLocation.x;
                break;
            case 'right':
                candidateLocation.x = candidateRect.left;
                directionDistance = candidateLocation.x - targetLocation.x;
                break;
        }

        let perpendicularDistance = 0;
        let centerPerpendicularDistance = 0;
        if (direction === 'up' || direction === 'down') {
            perpendicularDistance = Math.abs(targetLocation.x - candidateLocation.x);
            if (perpendicularDistance !== 0)
                centerPerpendicularDistance = Math.abs(targetLocation.cx - candidateLocation.x);
        }
        else {
            perpendicularDistance = Math.abs(targetLocation.y - candidateLocation.y);
            if (perpendicularDistance !== 0)
                centerPerpendicularDistance = Math.abs(targetLocation.cy - candidateLocation.y);
        }

        if (centerPerpendicularDistance * targetLocation.ratio > Math.abs(directionDistance))
            return { valid: false, directionDistance, perpendicularDistance, distanceSquared: 0 };

        return {
            valid: true,
            directionDistance,
            perpendicularDistance,
            distanceSquared: (directionDistance * directionDistance) + (perpendicularDistance * perpendicularDistance),
        };
    }

    private alignHorizontalEdges(targetRect: DOMRect, candidateRect: DOMRect, targetLocation: { cx: number, x: number }, candidateLocation: { x: number }): void {
        if (candidateRect.left <= targetLocation.cx && candidateRect.right >= targetLocation.cx) {
            targetLocation.x = targetLocation.cx;
            candidateLocation.x = targetLocation.cx;
        }
        else if (candidateRect.left >= targetRect.left && candidateRect.right <= targetRect.right) {
            targetLocation.x = candidateRect.right;
            candidateLocation.x = candidateRect.right;
        }
        else if (targetRect.left <= candidateRect.right && targetRect.left >= candidateRect.left) {
            targetLocation.x = candidateRect.right;
            candidateLocation.x = candidateRect.right;
        }
        else if (targetRect.right >= candidateRect.left && targetRect.right <= candidateRect.right) {
            targetLocation.x = candidateRect.left;
            candidateLocation.x = candidateRect.left;
        }
        else if (candidateRect.right < targetRect.left) {
            targetLocation.x = targetRect.left;
            candidateLocation.x = candidateRect.right;
        }
        else {
            targetLocation.x = targetRect.right;
            candidateLocation.x = candidateRect.left;
        }
    }

    private alignVerticalEdges(targetRect: DOMRect, candidateRect: DOMRect, targetLocation: { cy: number, y: number }, candidateLocation: { y: number }): void {
        if (candidateRect.top <= targetLocation.cy && candidateRect.bottom >= targetLocation.cy) {
            targetLocation.y = targetLocation.cy;
            candidateLocation.y = targetLocation.cy;
        }
        else if (candidateRect.top >= targetRect.top && candidateRect.bottom <= targetRect.bottom) {
            targetLocation.y = candidateRect.bottom;
            candidateLocation.y = candidateRect.bottom;
        }
        else if (targetRect.top <= candidateRect.bottom && targetRect.top >= candidateRect.top) {
            targetLocation.y = candidateRect.bottom;
            candidateLocation.y = candidateRect.bottom;
        }
        else if (targetRect.bottom >= candidateRect.top && targetRect.bottom <= candidateRect.bottom) {
            targetLocation.y = candidateRect.top;
            candidateLocation.y = candidateRect.top;
        }
        else if (candidateRect.bottom < targetRect.top) {
            targetLocation.y = targetRect.top;
            candidateLocation.y = candidateRect.bottom;
        }
        else {
            targetLocation.y = targetRect.bottom;
            candidateLocation.y = candidateRect.top;
        }
    }
}
