
// Can't subclass HTMLButtonElement under safari

let ButtonElement: typeof HTMLElement;

const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

if (isSafari)
    ButtonElement = HTMLElement;
else
    ButtonElement = HTMLButtonElement;

export default ButtonElement;
