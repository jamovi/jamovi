'use strict';

const $ = require('jquery');
const EventEmitter = require('events');

// the SelectionLoop is a class that manages which child control has selection (not focus)
// and the movement and behaviour of that selection between and within other child controls
class SelectionLoop extends EventEmitter {

    constructor(name, element) {
        super();

        this.name = name;
        this.container = element;

        this.container.setAttribute('tabindex', '-1');

        this.container.addEventListener('focus', (event) => {
            this.highlightElement(this.selectedElement);
        });

        this.container.addEventListener('focusin', (event) => {
            let element = event.target;
            if (element != this.container)
                this.highlightElement(element, false, false);
        });

        this.itemClass = `${this.name}-list-item`;
        this.selectedItemClass = `${this.name}-selected-item`;
        this.highlightedItemClass = `${this.name}-highlighted-item`;
        this.autoSelectClass = `${this.name}-auto-select`;
        this.itemIgnoreClass = `${this.name}-item-ignore`;
        this.actionClass = `${this.name}-action`;

        this.focusElement = null;
        this.selectedElement = null;

        this.container.addEventListener('keydown', this._handleKeyPress.bind(this));
        this.container.addEventListener('click', this._handleClick.bind(this));
    }


    highlightElement(element, highlightOnly, applyFocus) {
        if (applyFocus === undefined)
            applyFocus = true;

        if (element && element.classList.contains(this.itemClass) && element != this.focusElement) {
            $(this.container).find(`.${this.highlightedItemClass}`).removeClass(this.highlightedItemClass);

            this.focusElement = element;
            element.classList.add(this.highlightedItemClass);

            $(this.container).find(`.${this.itemClass}[tabindex="0"]`).attr('tabindex', '-1');
            this.focusElement.setAttribute('tabindex', '0');
        }

        if (this.focusElement && document.activeElement !== this.focusElement) {
            if (applyFocus)
                this.focusElement.focus();
            this.emit('highlight-index-changed', { target: this.focusElement });
        }

        if ( ! highlightOnly && element && element.classList.contains(this.autoSelectClass))
            this._selectElement(element);
    }


    selectElement(element, withMouse, silent) {
        this.highlightElement(element, true, ! silent);
        this._selectElement(element, withMouse, silent);
    }

    _selectElement(element, withMouse, silent) {
        if (element && element.classList.contains(this.itemClass) && (element != this.selectedElement || element.classList.contains(this.actionClass))) {
            this.selectedElement = element;
            if ( ! silent)
                this.emit('selected-index-changed', { target: element, withMouse: withMouse });
        }
    }

    _handleKeyPress(event) {
        switch (event.code) {
            case 'Enter':
            case 'Space':
                this.selectElement(this.focusElement, false);
                //event.stopPropagation();
                event.preventDefault();
                break;
        }
    }

    _handleClick(event) {
        let element = $(event.target).closest(`.${this.itemClass}`)[0];
        if (element && ! element.classList.contains(this.autoSelectClass))
            this.selectElement(element, event.detail > 0);
    }
}

module.exports = SelectionLoop;
