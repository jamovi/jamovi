
// Can't subclass HTMLButtonElement under safari

let ButtonElement: typeof HTMLElement;

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

if (isSafari) {
    ButtonElement = class extends HTMLElement {
        constructor() {
            super();

            this.role = 'button';
            this.tabIndex = 0;
        }
    }
}
else
    ButtonElement = HTMLButtonElement;

const origDefine: (name: string, constructor: CustomElementConstructor, options?: ElementDefinitionOptions) => void = customElements.define;
customElements.define = function(name: string, constructor: CustomElementConstructor, options?: ElementDefinitionOptions & { ignoreButtonCheck?: boolean }) {
    options = options || { };
    if ( ! options?.ignoreButtonCheck) {
        if (HTMLButtonElement.prototype.isPrototypeOf(constructor.prototype))
            options = { ...options, extends: 'button' };
        else if (options.extends === 'button')
            delete options.extends;
    }

    return origDefine.call(this, name, constructor, options);
};

export default ButtonElement;
