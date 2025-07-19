import GridControl from "./gridcontrol";

type Constructor<T> = new (...args: any[]) => T;
export const HiddenScrollBarSupport = <TBase extends Constructor<InstanceType<typeof GridControl>>>(Base: TBase) => 
    class HiddenScrollBarSupport extends Base {
    constructor(...args: any[]) {
        super(...args);

        this.timeoutId = null;
        this.timeoutId2 = null;
        this.noscroll = false;

        this.el.addEventListener('scroll', () => {
            this._resetScrollIssue(1000, 100);
        });

        this.el.addEventListener('click', () => {
            this._resetScrollIssue(-1, 500);
        });

        let MutationObserver = window.MutationObserver || window.WebKitMutationObserver;

        let observer = new MutationObserver((mutations, observer) => {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0){
                    this._resetScrollIssue(-1, 500);
                    break;
                }
            }
        });

        observer.observe(this.el, {
            childList: true,
            subtree: true
        });
    }

    _resetScrollIssue(delay, noScrollDelay) {
        noScrollDelay = noScrollDelay === undefined ? 100 : noScrollDelay;

        if (this.timeoutId)
            clearTimeout(this.timeoutId);

        if (this.timeoutId2)
            clearTimeout(this.timeoutId2);

        let reset = () => {
            this.noscroll = true;
            this.el.classList.add('mac-scroll-fix');
            this.timeoutId2 = setTimeout(() => {
                this.noscroll = false;
                this.el.classList.remove('mac-scroll-fix');
            }, noScrollDelay);
        };

        if (this.noscroll === false && delay >= 0)
            this.timeoutId = setTimeout (reset, delay);
        else
            reset();
    }
}

export default HiddenScrollBarSupport;
