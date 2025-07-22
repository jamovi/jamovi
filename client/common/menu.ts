'use strict';

import focusLoop from './focusloop';

export class Menu extends HTMLElement {
    owner: HTMLElement;
    menuId: string;
    level: number;
    _visible: boolean = false;
    connected: boolean;

    constructor(owner: HTMLElement=null, level: number=null, options: {id: string | undefined, className: string | undefined, exitKeys: string[] | undefined }=null) {
        super();

        this.connected = false;

        let menuId = null;
        if (options && options.id) 
            menuId = options.id;
        else
            menuId = focusLoop.getNextAriaElementId('menu');
        this.menuId = menuId;

        this.owner = owner;
        this.level = (level == null || level == undefined) ? 0 : level;

        if (this.owner) {
            this.owner.setAttribute('aria-haspopup', 'true');
            this.owner.setAttribute('aria-expanded', 'false');
            this.owner.setAttribute('aria-controls', menuId);
            this.owner.setAttribute('aria-owns', menuId);
            this.owner.classList.add('menu-owner');
        }

        this.setAttribute('class', 'jmv-menu jmv-ribbon-group-body-vertical jmv-menu-hidden');
        this.setAttribute('id', menuId);
        this.setAttribute('role', 'menu');
        this.setAttribute('tabindex', '-1');

        if (this.owner) {
            let labelId = this.owner.getAttribute('id');
            if (labelId)
                this.setAttribute('aria-labelledby', labelId);
        }
        
        if (options && options.className)
            this.classList.add(...options.className.split(' '));

        this.addEventListener('focusout', (event: FocusEvent) => {
            if (event.relatedTarget === null || (event.relatedTarget instanceof Node) && ! this.contains(event.relatedTarget))
                this.hide();
        });
        this.addEventListener('mouseleave', (event) => {
            if (this._visible && this.querySelector('[aria-expanded="true"]') === null)
                this.focus();

            if (this.owner)
                this.owner.classList.remove('mouse-over');
        });

        this.addEventListener('mouseenter', (event) => {
            if (this.owner)
                this.owner.classList.add('mouse-over');
        });

        let opts = { level: level, hoverFocus: true, exitKeys: ['Escape'], exitSelector: null };

        if (options && options.exitKeys)
            opts.exitKeys = opts.exitKeys.concat(options.exitKeys);
        
        if (this.owner)
            opts.exitSelector = new WeakRef(this.owner);

        let focusToken = focusLoop.addFocusLoop(this, opts);
        focusToken.on('focusleave', (event) => {
            if (focusLoop.loopEntering === null || focusToken.el.contains(focusLoop.loopEntering.el) === false)
                this.hide(this);
            else
                event.cancel = true;
        });
    }

    connect(menu) {
        let parent = null;
        if (! menu)
            parent = document.body;
        else
            parent = menu;

        parent.append(this);
        this.connected = true;
    }

    setOwner(owner: HTMLElement) {
        this.owner = owner;

        if (this.owner) {
            this.owner.setAttribute('aria-haspopup', 'true');
            this.owner.setAttribute('aria-expanded', 'false');
            this.owner.setAttribute('aria-controls', this.menuId);
            this.owner.setAttribute('aria-owns', this.menuId);
            this.owner.classList.add('menu-owner');

            let labelId = this.owner.getAttribute('id');
            if (labelId)
                this.setAttribute('aria-labelledby', labelId);  

            let token = focusLoop.getFocusToken(this);
            token.exitSelector = new WeakRef(this.owner);
        }
    }

    changeLevel(level:number) {
        this.level = level;
        focusLoop.changeLevel(this, level);
    }

    show(x, y, options, openPath) {

        if (typeof options !== 'object')
            throw 'problem';

        if (this._visible)
            return;

        openPath = openPath === undefined ? [] : openPath;

        this._visible = true;

        if (this.owner) {
            this.owner.setAttribute('aria-expanded', 'true');
            this.owner.classList.add('active');
        }

        this.classList.remove('jmv-menu-hidden');

        const el = this;

        const rect = el.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(el);

        // Include margins if needed (like `outerHeight(true)` in jQuery)
        const marginTop = parseFloat(computedStyle.marginTop);
        const marginBottom = parseFloat(computedStyle.marginBottom);
        const marginLeft = parseFloat(computedStyle.marginLeft);
        const marginRight = parseFloat(computedStyle.marginRight);

        const height = rect.height + marginTop + marginBottom;
        const width = rect.width + marginLeft + marginRight;

        if (y + height > window.innerHeight) 
            y -= (y + height) - window.innerHeight;

        if (x + width > window.innerWidth)
            x -= (x + width) - window.innerWidth;

        // Apply the adjusted position
        el.style.position = 'fixed';//, depending on your case
        el.style.top = `${y}px`;
        el.style.left = `${x}px`;

        focusLoop.enterFocusLoop(this, options);

        let event = new CustomEvent('menu-shown');
        this.dispatchEvent(event);
    }

    isVisible() {
        return this._visible;
    }

    hide(event=null) {
        if (this._visible === false)
            return;

        this._visible = false;

        this.classList.add('jmv-menu-hidden');

        if (this.owner) {
            this.owner.setAttribute('aria-expanded', 'false');
            this.owner.classList.remove('active');
        }

        focusLoop.leaveFocusLoop(this, true);

        //this.emit('menu-hidden', event);
        let newEvent = new CustomEvent('menu-hidden', { detail: event, bubbles: true });
        this.dispatchEvent(newEvent);
    }
}

customElements.define('jmv-menu', Menu);

export default Menu;
