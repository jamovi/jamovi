    

    const lightnessToWhite = function(el: HTMLElement) {
        const rgb = getComputedStyle(el).backgroundColor;

        // Extract RGB values
        const [r, g, b] = rgb.match(/\d+/g).map(Number);

        // Calculate luminance (sRGB standard)
        const toLinear = c => {
            c /= 255;
            return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };

        const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

        // Normalize: 0 = black, 1 = white
        return L;
    }

    export default class HighContrast {
        media: MediaQueryList;
        colorTester: HTMLElement;
        darkElementGetter: () => NodeListOf<HTMLElement>;
        lightElementGetter: () => NodeListOf<HTMLElement>;

        refreshDelay: NodeJS.Timeout = null;
        observer: MutationObserver;
        contrastDetail: boolean;

        constructor(_colorTester: HTMLElement, target: Node, _darkElementGetter: () => NodeListOf<HTMLElement>, _lightElementGetter: () => NodeListOf<HTMLElement>, _contrastDetail: boolean) {
            this.contrastDetail = _contrastDetail;
            this.colorTester = _colorTester;
            this.darkElementGetter = _darkElementGetter;
            this.lightElementGetter = _lightElementGetter;
            this.media = window.matchMedia('(forced-colors: active)');
            this.media.addEventListener('change', (e: MediaQueryListEvent) => this.handleForcedColorsChange(e.matches));

            this.refresh = this.refresh.bind(this);
            const observer = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (!(node instanceof HTMLElement))
                            continue;

                        if (this.refreshDelay === null)
                            this.refreshDelay = setTimeout(this.refresh, 0);
                    }
                }
            });

            observer.observe(target, { childList: true, subtree: true });
        }

        public refresh() {
            this.handleForcedColorsChange(this.media.matches);
            this.refreshDelay = null;
        }

        private handleForcedColorsChange(forcedColors: boolean) {
            let invert = forcedColors && lightnessToWhite(this.colorTester) < 0.5;
            if (this.darkElementGetter) {
                this.darkElementGetter().forEach(el => {
                    if (forcedColors === false)
                        el.style.filter = '';
                    else if (invert) {
                        el.style.filter = 'invert(1) brightness(250%) contrast(130%) saturate(120%) grayscale(1)';
                    }
                    else {
                        el.style.filter = 'invert(1) brightness(210%) contrast(130%) saturate(120%) invert(1) grayscale(1)';
                    }
                });
            }
            if (this.lightElementGetter) {
                this.lightElementGetter().forEach(el => {
                    if (forcedColors === false)
                        el.style.filter = '';
                    else if (invert) {
                        el.style.filter = 'brightness(250%) contrast(130%) saturate(120%) grayscale(1)';
                    }
                    else {
                        el.style.filter = 'brightness(210%) contrast(130%) saturate(120%) invert(1) grayscale(1)';
                    }
                });
            }
        }
    }