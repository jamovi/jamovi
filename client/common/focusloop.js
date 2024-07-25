'use strict';

const $ = require('jquery');
const EventEmitter = require('events');

class FocusLoopToken extends EventEmitter {
    constructor(options) {
        super();
        Object.assign(this, options);
    }
}

// the FocusLoop is a static class that manages which control has focus (not selection/highlight)
// and the movement and behaviour of that focus between and within controls
class FocusLoop extends EventEmitter {

    constructor(desktopMode) {
        super();

        this._mainWindow = window.top;
        this._isMainWindow = this._mainWindow === window;
        this._windowName = this._isMainWindow ? 'MainWindow' : window.name;

        this._avaliableFocusId = 0;
        this.shortcutTree = new WeakMap();
        this.loopOptions = new WeakMap();
        this.focusMode = 'default';
        this.inFocusLoop = 0;
        this.isBluring = false;
        this.isBlured = document.hasFocus() === false;
        this.shortcutPath = '';
        this.focusDefault = 'default';

        this._handleKeyPress = this._handleKeyPress.bind(this);
        this._handleMouseMove = this._handleMouseMove.bind(this);

        this._bluringTimeout = null;
        this._broadcastTimeout = null;

        window.addEventListener('message', event => {
            if (event.source === window)
                return;

            let data = event.data;

            if (data.type !== 'focusLoop')
                return;

            this._fromBroadcast = false;
            switch (data.id) {
                case 'setFocusMode':
                    this._fromBroadcast = true;
                    break;
                case 'setFocusDefault':
                    this._fromBroadcast = true;
                    break;
            }
            if (this._fromBroadcast) {
                this[data.id].apply(this, data.args);
                this._fromBroadcast = false;
            }
        });

        if (desktopMode) {
            window.addEventListener('keydown', (event) => {
                if (event.altKey && event.key === 'F4')
                    return;

                if (event.ctrlKey) {
                    this.ctrlDown = true;
                    return;
                }
                
                if (event.altKey) {
                    if (this.focusMode !== 'shortcuts') {
                        this.altDown = true;
                        if ( ! this.altTimer) {
                            this.shortcutPath = '';
                            this.altTimer = setTimeout(() => {
                                if (this.ctrlDown === false) {
                                    this.setFocusMode('shortcuts');
                                    this.turnedOn = true;
                                }
                                this.altTimer = null;
                            }, 1000);
                        }

                        if (event.keyCode !== 18)
                            this.shortcutPath += event.key.toUpperCase();
                    }

                    event.preventDefault();
                    event.stopPropagation();
                }
            });

            window.addEventListener('keyup', (event) => {
                if (event.ctrlKey)
                    this.ctrlDown = true;

                if (event.keyCode === 18) {  //to surpress the defualt browser behaviour for an alt key press
                    this.altDown = false;
                    if (this.altTimer) {
                        clearTimeout(this.altTimer);
                        this.altTimer = null;
                    }

                    if (this.ctrlDown === false) {
                        
                        if (!this.turnedOn) {
                            if (this.focusMode === 'shortcuts' /*this.inAccessibilityMode()*/) {
                                this.shortcutPath = '';
                                this.setFocusMode('default');
                            }
                            else
                                this.setFocusMode('shortcuts');
                        }
                        this.turnedOn = false;

                        event.preventDefault();
                        event.stopPropagation();
                    }

                    this.ctrlDown = false;
                }
            });
        }
        else {
            window.addEventListener('keydown', (event) => {
                if (event.altKey && event.key !== 'Alt') // as modifier
                    this._starting = false
                else if (event.key === 'Alt')
                    this._starting = true;
            });

            window.addEventListener('keyup', (event) => {
                if (this._starting === false)
                    return;

                this._starting = false;

                if (event.key === 'Alt') { // not as modifier
                    if (event.ctrlKey === false) {
                        if (this.focusMode === 'shortcuts' /*this.inAccessibilityMode()*/) {
                            this.shortcutPath = '';
                            this.setFocusMode('default');
                        }
                        else if (this.focusMode !== 'shortcuts') {
                            this.shortcutPath = '';
                            this.setFocusMode('shortcuts');
                        }
                    }

                    event.preventDefault();
                    event.stopPropagation();
                }
            });
        }

        
        window.addEventListener('focus', (event) => {
            this.emit('focus', event);

            this.isBluring = false;
            this.isBlured = false;

            if (this.focusMode === 'default' && this._isMainWindow === false) {
                this._broadcastTimeout = setTimeout(() => {
                    this._broadcastTimeout = null;
                    this.broadcastFocusMode(this.focusMode);
                }, 0);

            }
        });

        window.addEventListener('pointerdown', (event) => {
            this._mouseClicked = true;
            if (this.inAccessibilityMode()) {
                setTimeout(() => {
                    let info = this.elementFocusDetails(event.target);
                    if (info.usesKeyboard)
                        this.setFocusMode('hover');
                    else
                        this.setFocusMode('default');
                }, 0);
            }
        });

        window.addEventListener('blur', (event) => {
            if (this._bluringTimeout) {
                clearTimeout(this._bluringTimeout);
                this._bluringTimeout = null;
            }

            this.isBluring = false;
            this.isBlured = true;
        });

        if (this._isMainWindow) {
            document.addEventListener('visibilitychange', (event) => {
                this.setFocusMode('default');
            });
        }

        window.addEventListener('focusout', (event) => {
            if (this._focusPassing || this.isBluring)
                return;

            //If default focus control looses focus for some reason it gives it back.
            if (event.target === this.defaultFocusControl && event.relatedTarget === null  && this._inDefaultMode) {
                event.target.focus();
            }

            if (event.relatedTarget === null && this.focusMode !== 'shortcuts') {
                this._bluringTimeout = setTimeout(() => {
                    this.setFocusMode('default');
                    this._bluringTimeout = null;
                }, 0);

            }
        });

        window.addEventListener('focusin', (event) => {
            let element = event.target;
            if (element === document.body)
                this.setFocusMode('default');
            else if (element !== null && element.classList.contains('temp-focus-cell') === false) {
                if (element === this._passedFocus) {
                    this._passedFocus = null;
                    this._focusPassing = false;
                }
                else if (! this.inAccessibilityMode()) {
                    let details = this.elementFocusDetails(element);
                    if (details.usesKeyboard || this.containsFocusableMenuLevel(event.composedPath()) || (this.inKeyboardMode() && ! this._mouseClicked)) {
                        let keyboardMode = 'hover';
                        if ( ! element.classList.contains('menu-level'))
                            keyboardMode = (this.focusMode === 'keyboard' && !this._mouseClicked) ? 'keyboard' : 'hover';
                        this.setFocusMode(keyboardMode);
                    }
                    else
                        this.setFocusMode('default');
                }
                else if (this.focusMode === 'shortcuts') {
                    let details = this.elementFocusDetails(element);
                    if (! details.containsShortcutKeys)
                        this.setFocusMode('accessible');
                }
            }
            else if (this.focusMode !== this.focusDefault)
                this.setFocusMode('default');

            this._mouseClicked = false;
        });
    }

    setDefaultFocusControl(defaultFocusControl) {
        this.defaultFocusControl = defaultFocusControl;
        if (this.defaultFocusControl && this._inDefaultMode)
            this.defaultFocusControl.focus();
    }

    getNextAriaElementId(prefix) {
        return `${prefix}-${this.getNextFocusId()}`;
    }

    inAccessibilityMode() {
        return this.focusMode === 'accessible' || this.focusMode === 'shortcuts';
    }

    inKeyboardMode() {
        return this.focusMode === 'accessible' || this.focusMode === 'shortcuts' || this.focusMode === 'keyboard';
    }

    elementFocusDetails(element) {
        let value = {
            shortcutKey: element.getAttribute('shortcut-key'),
            usesKeyboard: element.closest('[aria-haspopup="true"]') !== null
        };
        value.containsShortcutKeys = element.querySelectorAll('[shortcut-key]') || value.shortcutKey;
        if (element.tagName === 'INPUT') {
            let elementType = element.getAttribute('type');
            if ( elementType === null || elementType === '' || elementType === 'text' || elementType === 'search') {
                value.isFocusController = false;
                value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false };
                value.usesKeyboard = true;
            }
        }
        else if (element.tagName === 'TEXTAREA') {
            value.isFocusController = false;
            value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: false, ArrowDown: false, Escape: false, Tab: false };
            value.usesKeyboard = true;
        }
        else if (element.tagName === 'SELECT') {
            value.isFocusController = false;
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
        else if (element.isContentEditable) {
            value.isFocusController = true;
            value.requires = { ArrowLeft: true, ArrowRight: true, ArrowUp: true, ArrowDown: true, Escape: false, Tab: false, Enter: true, Space: true };
            value.usesKeyboard = true;
        }

        return value;
    }

    transferFocus(otherWindow) {
        this.isBluring = true;
        otherWindow.focus();
        if (otherWindow !== this._mainWindow) {
            if (otherWindow.contentWindow) {
                setTimeout(() => { // needed for firefox cross iframe focus
                    otherWindow.contentWindow.focus();
                }, 100);
            }
        }
    }

    containsFocusableMenuLevel(elementPath) {
        for (let element of elementPath) {
            if (element.classList && element.classList.contains('menu-level') && element.hasAttribute('tabindex'))
                return true;
            if (element === document.body)
                return false;
        }

        return false;
    }

    setFocusDefault(value, options) {
        if ( ! this.isFocusModeValid(value))
            throw `Unknown focusMode - "${value}"`;

        let fromBroadcast = this._fromBroadcast;
        if (value !== this.focusDefault) {
            this.focusDefault = value;
            if ( ! fromBroadcast && this.isBluring === false && this.isBlured === false) {
                let noTransfer = options ? options.noTransfer : false;
                this.broadcast('setFocusDefault', [value, options], ! noTransfer);
                if (this._inDefaultMode)
                    this.setFocusMode('default');
            }

        }
    }

    endModalMode() {
        this.setFocusDefault('default', { });
    }

    beginModalMode() {
        this.setFocusDefault('hover', { });
    }

    isFocusModeValid(value) {
        return value === 'shortcuts' || value === 'accessible' || value === 'keyboard' || value === 'hover' || value === 'default';
    }

    setFocusMode(value, options) {

        if (this._bluringTimeout) {
            clearTimeout(this._bluringTimeout);
            this._bluringTimeout = null;
        }

        if ( ! this.isFocusModeValid(value))
            throw `Unknown focusMode - "${value}"`;

        this._inDefaultMode = value === 'default';
        if (this._inDefaultMode)
            value = this.focusDefault;

        let silent = options ? options.silent : false;
        let fromBroadcast = this._fromBroadcast;
        if (this.focusMode !== value) {
            let prevMode = this.focusMode;

            this.focusMode = value;

            if (prevMode === 'shortcuts' || this.focusMode === 'shortcuts')
                this.shortcutPath = '';

            if (this.defaultFocusControl && this.focusMode === 'default')
                this.defaultFocusControl.focus();

            if ((this.focusMode === 'shortcuts' || prevMode === 'shortcuts') && this.focusMode !== prevMode)
                this.updateShortcuts();
            if ( ! fromBroadcast && this.isBluring === false && this.isBlured === false)
                this.broadcastFocusMode(value, options);
            if (! silent)
                this.emit('focusModeChanged', options ? options : { });

            this.updateBodyAttributes();
        }
    }

    updateBodyAttributes() {
        if (this.inAccessibilityMode())
            document.body.setAttribute('accessible', true);
        else
            document.body.setAttribute('accessible', false);
        if (this.inKeyboardMode())
            document.body.setAttribute('keyboardfocus', true);
        else
            document.body.setAttribute('keyboardfocus', false);
        document.body.setAttribute('focusMode', this.focusMode);
    }

    broadcastFocusMode(focusMode, options) {
        if (this._broadcastTimeout) {
            clearTimeout(this._broadcastTimeout);
            this._broadcastTimeout = null;
        }

        let noTransfer = options ? options.noTransfer : false;

        this.broadcast('setFocusMode', [focusMode, options], ! noTransfer && (focusMode !== 'keyboard' && focusMode !== 'hover'));
    }

    broadcast(id, args, transferFocus) {
        let data = { id, args, type: 'focusLoop' };
        if (this._isMainWindow === false) {
            if (transferFocus)
                this.transferFocus(this._mainWindow);
            this._mainWindow.postMessage(data, '*');
        }
        for (let i = 0; i < this._mainWindow.frames.length; i++) {
            if (this._mainWindow.frames[i] !== window)
                this._mainWindow.frames[i].postMessage(data, '*');
        }
    }

    getNextFocusId() {
        return this._avaliableFocusId++;
    }

    changeLevel(element, level) {
        let token = this.loopOptions.get(element);
        if (token) {
            token.level = level;
            element.setAttribute('data-level', token.level);
        }
    }

    addFocusLoop(element, options) {

        // options = { level, closeHandler, exitSelector, hoverFocus, keyToEnter, modal }

        if (options === undefined)
            options = { };

        if (options.level === undefined)
            options.level = 0;

        if (options.exitKeys === undefined)
            options.exitKeys = [];

        let token = new FocusLoopToken(options);

        this.loopOptions.set(element, token);

        if (token.exitSelector && typeof token.exitSelector !== 'string' && token.exitSelector.deref === undefined)
            token.exitSelector = new WeakRef(token.exitSelector);

        element.setAttribute('data-level', token.level);
        element.classList.add('menu-level');
        if (token.hoverFocus)
            element.classList.add('hover-focus');

        let listener = element.closest('.focus-listener');
        if ( ! listener) {
            element.addEventListener('keydown', this._handleKeyPress);
            if (token.hoverFocus)
                element.addEventListener('mousemove', this._handleMouseMove);
            element.classList.add('focus-listener');
        }

        return token;
    }

    downgradeShortcuts() {
        if (this.focusMode === 'shortcuts')
            this.setFocusMode('accessible');
    }

    async timeout(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    applyShortcutOptions(element, options) {

        // { key, path, action, position, blocking, maintainAccessibility }

        let token = this.shortcutTree.get(element);
        if ( ! token) {
            token = new FocusLoopToken(options);
            this.shortcutTree.set(element, token);
        }
        else {
            if (token.action && options.action)
                token.off('shortcut-action', options.action);

            token = Object.assign(token, options);
        }

        if (token.key === undefined)
            throw 'All shortcuts need at least "key" specified.';

        if (token.key.indexOf('-') >= 0)
            throw `The key can't have a '-' in it.`;

        if (token.path)
            token.fullPath = `${token.path}${token.key}`;
        else
            token.fullPath = token.key;

        element.setAttribute('shortcut-key', token.key);

        if (options.path)
            element.setAttribute('shortcut-path', token.fullPath);

        if (options.action)
            token.on('shortcut-action', token.action);

        return token;
    }

    nullishCheck(option1, option2) {
        return (option1 == null || option1 == undefined) ? option2 : option1;
    }

    async updateShortcuts(options) {
        options = this.nullishCheck(options, { });
        let retries = this.nullishCheck(options.retries, 0);
        let shortcutPath = this.nullishCheck(options.shortcutPath, this.shortcutPath);
        let silent = this.nullishCheck(options.silent, this.silent);
        if (options.append)
            shortcutPath += options.append;

        if (this.focusMode === 'shortcuts') {
            let filter = `[shortcut-key]:not([shortcut-path])`;
            if (shortcutPath)
                filter = `[shortcut-path^="${shortcutPath}"], [shortcut-key|="${shortcutPath}"]:not([shortcut-path])`;

            let actionableElement = null;
            let actionableToken = null;
            let elements = [...document.querySelectorAll(filter)].filter(el => {

                if (el.offsetWidth <= 0 || el.offsetHeight <= 0 || el.getAttribute('aria-hidden') || window.getComputedStyle(el).visibility === "hidden")
                    return false;

                let path = el.getAttribute('shortcut-path');
                let display = el.getAttribute('shortcut-key');
                if (path === shortcutPath || (path === null && display === shortcutPath)) {
                    actionableElement = el;
                    actionableToken = this.shortcutTree.get(actionableElement);
                    return false;
                }
                if (path && path !== shortcutPath) {
                    for (let i = 1; i <= display.length; i++) {
                        if (path.slice(0, -i) === shortcutPath)
                            return true;
                    }
                    return false;
                }
                return true;
            });

            if (actionableElement || elements.length > 0)
                options.retries = 0;

            if (actionableElement) {
                if ( ! silent) {
                    if (actionableToken) {
                        let event = {
                            target: actionableElement,
                            currentTarget: actionableElement,
                            _defaultPrevented: false
                        };
                        event.preventDefault = () => event._defaultPrevented = true;

                        actionableToken.emit('shortcut-action', event);
                    }
                    else {
                        const event = new Event('shortcut-action', { cancelable: true });
                        actionableElement.dispatchEvent(event);
                    }
                }
            }

            if (actionableToken && actionableToken.blocking)
                return false;

            if (elements.length === 0) {
                if (retries < 4) {
                    await this.timeout(50);
                    return this.updateShortcuts({ shortcutPath: shortcutPath, silent: true, retries: retries + 1, keyCount: elements.length, lastActionableToken: this.nullishCheck(options.lastActionableToken, actionableToken) });
                }

                if (actionableElement) {
                    let details = this.elementFocusDetails(actionableElement);
                    if (actionableToken.maintainAccessibility || details.usesKeyboard) {
                        this.setFocusMode('accessible');
                        if (details.isFocusController === false)
                            actionableElement.focus();
                    }
                    else
                        this.setFocusMode('default');
                }
                else if ( ! options.lastActionableToken)
                    return false;
            }
            /*else if (elements.length !== options.keyCount) {
                await this.timeout(100);
                return this.updateShortcuts({ shortcutPath: shortcutPath, silent: true, retries: retries + 1, keyCount: elements.length, lastActionableToken: this.nullishCheck(options.lastActionableToken, actionableToken) });
            }*/

            let keyLabels = document.querySelectorAll('.shortcut-key-tag');
            for (let keyLabel of keyLabels)
                keyLabel.remove();

            if (shortcutPath !== this.shortcutPath) {
                this.shortcutPath = shortcutPath;
                this.emit('shortcutPathChanged', this.shortcutPath);
            }

            for (let element of elements) {
                let key = null;
                let display = null;
                let path = null;
                let position = { x: '50%', y: '75%', internal: false };
                let info = this.shortcutTree.get(element);
                if ( ! info) {
                    path = element.getAttribute('shortcut-path');
                    key = element.getAttribute('shortcut-key');
                }
                else {
                    path = info.fullPath;
                    key = info.key;
                    if (info.position)
                        position = info.position;
                }

                if (path) {
                    let length = path.length - shortcutPath.length;
                    display = key.slice(key.length - length);
                }
                else
                    display = key;

                let $shortcutElement = $(`<div id="sct-${display}" class="shortcut-key-tag" aria-hidden="true">${display}</div>`);
                let rect = element.getBoundingClientRect();
                let offset = { x: 15, y: 15 };

                let rectX = rect.left;
                let rectY = rect.top;
                if (position.internal) {
                    rectX = 0;
                    rectY = 0;
                }

                let posY = position.y;
                if (posY.endsWith('%'))
                    posY = parseFloat(posY) / 100;
                else if (posY.endsWith('px'))
                    posY = parseFloat(posY) / rect.height;
                else
                    throw 'Must specify units for position';

                if ( ! position.internal && posY > 0.5)
                    offset.y = 0;
                else if (position.internal && posY < 0.5)
                    offset.y = 0;
                else if (posY === 0.5)
                    offset.y = offset.y / 2;

                let posX = position.x;
                if (posX.endsWith('%'))
                    posX = parseFloat(posX) / 100;
                else if (posX.endsWith('px'))
                    posX = parseFloat(posX) / rect.width;
                else
                    throw 'Must specify units for position';

                if ( ! position.internal && posX > 0.5)
                    offset.x = 0;
                else if (position.internal && posX < 0.5)
                    offset.x = 0;
                else if (posX === 0.5)
                    offset.x = offset.x / 2;

                let css = { top: `${rectY + (rect.height * posY) - offset.y}px`, left: `${rectX + (rect.width * posX) - offset.x}px` };

                $shortcutElement.css(css);
                if (position.internal)
                    element.append($shortcutElement[0]);
                else
                    document.body.append($shortcutElement[0]);
            }

            return true;
        }
        else {
            let keyLabels = document.querySelectorAll('.shortcut-key-tag');
            for (let keyLabel of keyLabels)
                keyLabel.remove();
        }

        return false;
    }

    keyboardfocusableElements(element, level, onlyTabbable) {
        let tabbable = onlyTabbable ? ':not([tabindex="-1"])' : '';
        return [...$(element).find(`
        a[href]${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        button${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        input${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        textarea${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        select${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        details${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *),
        [tabindex]${tabbable}:not(.menu-level[data-level="${ parseInt(level) + 1 }"] *)`)]
                .filter(el => el.offsetWidth > 0 && el.offsetHeight > 0 && !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden') && window.getComputedStyle(el).visibility !== "hidden");
    }

    enterFocusLoop(loopElement, options) {
        // { withMouse, direction }
        this._mouseClicked = options.withMouse;
        let token = this.loopOptions.get(loopElement);
        if (token.modal)
            this.beginModalMode();

        if ( ! options.withMouse) {
            let parent = loopElement.closest('.menu-level');
            if (parent) {
                let level = parent.getAttribute('data-level');
                let list = this.keyboardfocusableElements(parent, level, true);
                if (list[0]) {
                    if (options.direction === 'up')
                        list[list.length - 1].focus();
                    else
                        list[0].focus();
                }
            }
        }
        else
            loopElement.focus();
    }

    leaveFocusLoop(loopElement, withMouse) {

        let token = this.loopOptions.get(loopElement);
        if ( ! token)
            return false;

        if (token._leavingLoop)
            return false;

        token._leavingLoop = true;

        let eventData = { cancel: false, passFocus: false, withMouse: withMouse };
        token.emit('focusleave', eventData);

        if (eventData.cancel) {
            token._leavingLoop = false;
            return false;
        }

        if (token.modal)
            this.endModalMode();

        let validExitElement = false;
        if (token.exitSelector && ! withMouse) {
            let element = token.exitSelector;
            if (typeof element === 'string')
                element = document.querySelector(element);
            else
                element = element.deref();

            if (element) {
                validExitElement = true;
                let parent = element.closest('.menu-level');
                this._focusPassing = this.inAccessibilityMode() || parent.hasAttribute('tabindex');
                if (this._focusPassing)
                    this._passedFocus = element;
            }
        }

        if (token.closeHandler)
            token.closeHandler(event);

        if (this._passedFocus)
            this._passedFocus.focus();

        token._leavingLoop = false;

        return token.closeHandler || validExitElement;
    }

    findBoundingRectangle(el) {
        if (el.parentElement.tagName === 'LABEL') {
            el = el.parentElement;
        }
        return el.getBoundingClientRect();
    }

    findNextElement(target, list, direction) {
        let arect = this.findBoundingRectangle(target);
        let closestDist = null;
        let closest = null;
        let closestStraightDist = null;
        let closestStraight = null;
        let furthestStraightDist = null;
        let furthestStraight = null;
        list = list.filter(el => {
            if (el.contains(target) || target.contains(el))
                return false;

            let blockingClass = `block-focus-${direction}`;
            if (el.classList.contains(blockingClass))
                return false;

            let brect = this.findBoundingRectangle(el);

            let aLocation = { cx: arect.left + ((arect.right - arect.left) / 2), cy: arect.top + ((arect.bottom - arect.top) / 2), ratio: arect.height / arect.width };
            let bLocation = { };

            if (brect.left <= aLocation.cx && brect.right >= aLocation.cx) {
                aLocation.x = aLocation.cx;
                bLocation.x = aLocation.cx;
            }
            else if (brect.left >= arect.left && brect.right <= arect.right) {
                aLocation.x = brect.right;
                bLocation.x = brect.right;
            }
            else if (arect.left <= brect.right && arect.left >= brect.left) {
                aLocation.x = brect.right;
                bLocation.x = brect.right;
            }
            else if (arect.right >= brect.left && arect.right <= brect.right) {
                aLocation.x = brect.left;
                bLocation.x = brect.left;
            }
            else if (brect.right < arect.left) {
                aLocation.x = arect.left;
                bLocation.x = brect.right;
            }
            else
            {
                aLocation.x = arect.right;
                bLocation.x = brect.left;
            }

            if (brect.top <= aLocation.cy && brect.bottom >= aLocation.cy) {
                aLocation.y = aLocation.cy;
                bLocation.y = aLocation.cy;
            }
            else if (brect.top >= arect.top && brect.bottom <= arect.bottom) {
                aLocation.y = brect.bottom;
                bLocation.y = brect.bottom;
            }
            else if (arect.top <= brect.bottom && arect.top >= brect.top) {
                aLocation.y = brect.bottom;
                bLocation.y = brect.bottom;
            }
            else if (arect.bottom >= brect.top && arect.bottom <= brect.bottom) {
                aLocation.y = brect.top;
                bLocation.y = brect.top;
            }
            else if (brect.bottom < arect.top) {
                aLocation.y = arect.top;
                bLocation.y = brect.bottom;
            }
            else
            {
                aLocation.y = arect.bottom;
                bLocation.y = brect.top;
            }


            let directionDistance = -1;
            switch (direction) {
                case 'up':
                    bLocation.y = brect.bottom;
                    directionDistance = aLocation.y - bLocation.y;
                break;
                case 'down':
                    bLocation.y = brect.top;
                    directionDistance = bLocation.y - aLocation.y;
                break;
                case 'left':
                    bLocation.x = brect.right;
                    directionDistance = aLocation.x - bLocation.x;
                break;
                case 'right':
                    bLocation.x = brect.left;
                    directionDistance = bLocation.x - aLocation.x;
                break;
            }

            let perpendicularDistance = 0;
            let centerPerpendicularDistance = 0;
            switch (direction) {
                case 'up':
                case 'down':
                    perpendicularDistance = Math.abs(aLocation.x - bLocation.x);
                    if (perpendicularDistance != 0)
                        centerPerpendicularDistance = Math.abs(aLocation.cx - bLocation.x);
                break;
                case 'left':
                case 'right':
                    perpendicularDistance = Math.abs(aLocation.y - bLocation.y);
                    if (perpendicularDistance != 0)
                        centerPerpendicularDistance = Math.abs(aLocation.cy - bLocation.y);
                break;
            }

            if (centerPerpendicularDistance * aLocation.ratio > Math.abs(directionDistance))
                return false;

            let distanceSquared = (directionDistance * directionDistance) + (perpendicularDistance * perpendicularDistance);

            if (directionDistance < 0) {
                if (perpendicularDistance === 0 && (furthestStraight === null || distanceSquared > furthestStraightDist)) {
                    furthestStraightDist = distanceSquared;
                    furthestStraight = el;
                }
                return false;
            }

            if (perpendicularDistance === 0 && (closestStraight === null || distanceSquared < closestStraightDist)) {
                closestStraightDist = distanceSquared;
                closestStraight = el;
            }

            if (closest === null || distanceSquared < closestDist) {
                closestDist = distanceSquared;
                closest = el;
            }
            return true;
        });
        if (closestStraight)
            closestStraight.focus();
        else if (closest)
            closest.focus();
        else if (furthestStraight)
            furthestStraight.focus();
        else
            return false;

        return true;
    }

    _handleMouseMove(event) {
        let target = event.target;
        if (this.focusMode === 'keyboard')
            this.setFocusMode('hover',  { noTransfer: true, silent: false });
    }

    createHoverItem(item, focusAction) {
        item.$el.on('click', event => {
            if (item._focusFocusTimer) {
                clearTimeout(item._focusFocusTimer);
                item._focusFocusTimer = null;
            }
        });
        item.$el.on('mousemove', (event) => {
            if (item.$el[0].contains(document.activeElement))
                return;

            if ( ! item._focusFocusTimer) {
                item._focusFocusTimer = setTimeout(() => {
                    if (focusAction)
                        focusAction();
                    else
                        item.$el[0].focus({preventScroll:true});
                }, 300);
            }
        });
        item.$el.on('mouseleave', (event) => {
            if (item._focusFocusTimer) {
                clearTimeout(item._focusFocusTimer);
                item._focusFocusTimer = null;
            }
        });
    }

    async _handleKeyPress(event) {
        this._mouseClicked = false;

        

        if (this.focusMode === 'default')
            return;

        let target = event.target;
        let details = this.elementFocusDetails(target);
        let reservedKeys = details.requires;

        let parent = target.closest('.menu-level');
        if (parent.classList.contains('focus-listener')) {
            let upperListener = parent.parentElement.closest('.focus-listener');
            if (upperListener) {
                parent.removeEventListener('keydown', this._handleKeyPress);
                parent.classList.remove('focus-listener');
                return;
            }
        }

        let exitKeys = [];
        let token = this.loopOptions.get(parent);
        exitKeys = token.exitKeys;
        let keyCode = event.code;
        if (event.altKey && event.code !== 'Alt')
            keyCode = 'Alt+' + keyCode;
        if (event.ctrlKey && event.code !== 'Ctrl')
            keyCode = 'Ctrl+' + keyCode;
        if (exitKeys.includes(keyCode)) {
            this.leaveFocusLoop(parent, false);
            event.preventDefault();
            return;
        }

        let keyToEnter = false;
        if (event.target === parent) {
            //let token = this.loopOptions.get(parent);
            keyToEnter = token.keyToEnter;
            if (keyToEnter) {
                parent = target.parentElement.closest('.menu-level');
                if ( ! parent)
                    parent = event.target;
            }
        }

        if (reservedKeys && reservedKeys[event.code])
            return;

        if (event.altKey) // alt as modifier
            return;

        if (this.focusMode === 'hover')
            this.setFocusMode('keyboard', { noTransfer: true, silent: false });

        let level = parent.getAttribute('data-level');
        let list = null;
        switch (event.code) {
            case "ArrowUp":
                if (this.focusMode === 'shortcuts')
                    this.setFocusMode('accessible', { noTransfer: true, silent: false });

                if (event.target === parent)
                    this.enterFocusLoop(parent, { withMouse: false, direction: 'up' });
                else {
                    let loopContainer = this.nullishCheck(target.closest('[vloop="true"]'), parent);
                    list = this.keyboardfocusableElements(loopContainer, level);
                    if (this.findNextElement(target, list, 'up'))
                        event.preventDefault();
                }
                break;
            case "ArrowDown":
                if (this.focusMode === 'shortcuts')
                    this.setFocusMode('accessible', { noTransfer: true, silent: false });

                if (event.target === parent)
                    this.enterFocusLoop(parent, { withMouse: false, direction: 'down' });
                else {
                    let loopContainer = this.nullishCheck(target.closest('[vloop="true"]'), parent);
                    list = this.keyboardfocusableElements(loopContainer, level);
                    if (this.findNextElement(target, list, 'down'))
                        event.preventDefault();
                }
                break;
            case "ArrowLeft":
                if (this.focusMode === 'shortcuts')
                    this.setFocusMode('accessible', { noTransfer: true, silent: false });

                if (event.target === parent)
                    this.enterFocusLoop(parent, { withMouse: false });
                else {
                    let loopContainer = this.nullishCheck(target.closest('[hloop="true"]'), parent);
                    //if (loopContainer.getAttribute('hloop') === 'true') {
                        list = this.keyboardfocusableElements(loopContainer, level);
                        if (this.findNextElement(target, list, 'left'))
                            event.preventDefault();
                    //}
                }
                break;
            case "ArrowRight":
                if (this.focusMode === 'shortcuts')
                    this.setFocusMode('accessible', { noTransfer: true, silent: false });

                if (event.target === parent)
                    this.enterFocusLoop(parent, { withMouse: false });
                else {
                    let loopContainer = this.nullishCheck(target.closest('[hloop="true"]'), parent);
                    list = this.keyboardfocusableElements(loopContainer, level);
                    if (this.findNextElement(target, list, 'right'))
                        event.preventDefault();
                }
                break;
            case "Escape":
                if (this.focusMode === 'shortcuts') {
                    if (this.shortcutPath.length > 0)
                        this.updateShortcuts({ shortcutPath: this.shortcutPath.slice(0, -1) });
                    else
                        this.setFocusMode('accessible', { noTransfer: true, silent: false });
                }

                if (this.leaveFocusLoop(parent, false))
                    event.preventDefault();
                else if (this.focusMode !== 'shortcuts') {
                    setTimeout(() => {  // to allow the keydown event to proceed while maintaining a little longer accessibility mode as true (if true)
                        target.blur();
                    }, 0);

                }
                break;
            case "Tab":
                if (this.focusMode === 'shortcuts')
                    this.setFocusMode('accessible', { noTransfer: true, silent: false });

                list = this.keyboardfocusableElements(parent, level, true);
                let index = list.indexOf(event.target);

                let newFocus = null;
                if (event.shiftKey) {
                    newFocus = list[index - 1];
                    if ( ! newFocus)
                        newFocus = list[list.length - 1];
                }
                else {
                    newFocus = list[index + 1];
                    if ( ! newFocus)
                        newFocus = list[0];
                }

                if (newFocus)
                    newFocus.focus();
                else
                    parent.focus();

                event.preventDefault();
                break;
            case 'Enter':
                if (keyToEnter) {
                    this.enterFocusLoop(event.target, { withMouse: false });
                    event.preventDefault();
                }
                break;
            default:
                if (event.keyCode === 18)
                    return;
                if (this.focusMode === 'shortcuts') {
                    if (event.key.length === 1) {
                        if (await this.updateShortcuts({ append: event.key.toUpperCase() })) {
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }
                }
                break;
        }
    }
}

const _focusLoop = new FocusLoop(false);

module.exports = _focusLoop;
