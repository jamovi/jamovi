'use strict';

const focusLoop = require('./focusloop');
const EventEmitter = require('events');
const $ = require('jquery');

class Menu extends EventEmitter {

    constructor(owner, level, options) {
        super();

        this.connected = false;

        let menuId = focusLoop.getNextAriaElementId('menu');

        this.owner = owner;
        this.level = (level == null || level == undefined) ? 0 : level;

        if (this.owner) {
            this.owner.setAttribute('aria-haspopup', true);
            this.owner.setAttribute('aria-expanded', false);
            this.owner.setAttribute('aria-controls', menuId);
            this.owner.setAttribute('aria-owns', menuId);
            this.owner.classList.add('menu-owner');
            
        }

        this.$el = $(`<div id="${menuId}" class="jmv-menu jmv-ribbon-group-body-vertical jmv-menu-hidden" tabindex="-1" role="menu"></div>`);
        if (this.owner) {
            let labelId = this.owner.getAttribute('id');
            if (labelId)
                this.$el.attr('aria-labelledby', labelId);
        }
        
        if (options && options.className)
            this.$el.addClass(options.className);

        this.$el.on('focusout', (event) => {
            if ( ! this.$el[0].contains(event.relatedTarget))
                this.hide();
        });
        this.$el.on('mouseleave', (event) => {
            if (this._visible && this.$el[0].querySelector('[aria-expanded="true"]') === null)
                this.$el.focus();

            if (this.owner)
                this.owner.classList.remove('mouse-over');
        });

        this.$el.on('mouseenter', (event) => {
            if (this.owner)
                this.owner.classList.add('mouse-over');
        });

        let opts = { level: level, hoverFocus: true };

        if (options && options.exitKeys)
            opts.exitKeys = options.exitKeys;
        
        if (this.owner)
            opts.exitSelector = new WeakRef(this.owner);

        let focusToken = focusLoop.addFocusLoop(this.$el[0], opts);
        focusToken.on('focusleave', (event) => {
            this.hide(this);
        });
    }

    connect(menu) {
        let $parent = null;
        if (! menu)
            $parent = $('body');
        else
            $parent = menu.$el;

        this.$el.appendTo($parent);
    }

    changeLevel(level) {
        this.level = level;
        focusLoop.changeLevel(this.$el[0], level);
    }

    show(x, y, options, openPath) {

        if (typeof options !== 'object')
            throw 'problem';

        if (this._visible)
            return;

        openPath = openPath === undefined ? [] : openPath;

        this._visible = true;

        if (this.owner) {
            this.owner.setAttribute('aria-expanded', true);
            this.owner.classList.add('active');
        }

        this.$el.removeClass('jmv-menu-hidden');

        if (y + this.$el.outerHeight(true) > window.innerHeight)
            y -= (y + this.$el.outerHeight(true)) - window.innerHeight;

        if (x + this.$el.outerWidth(true) > window.innerWidth)
            x -= (x + this.$el.outerWidth(true)) - window.innerWidth;

        this.$el.css({ top: y, left: x });

        focusLoop.enterFocusLoop(this.$el[0], options);
        this.emit('menu-shown');
    }

    isVisible() {
        return this._visible;
    }

    hide(event) {
        if (this._visible === false)
            return;

        this._visible = false;

        this.$el.addClass('jmv-menu-hidden');

        if (this.owner) {
            this.owner.setAttribute('aria-expanded', false);
            this.owner.classList.remove('active');
        }

        focusLoop.leaveFocusLoop(this.$el[0], true);

        this.emit('menu-hidden', event);
    }
}

module.exports = Menu;
