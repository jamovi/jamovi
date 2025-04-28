
'use strict';

export class ProgressStream<P, R> implements AsyncIterable<P>, PromiseLike<R> {

    _progress: P;
    setProgress: (progress: P) => void;

    _progress_prom: Promise<void>;
    _resolve_progress: () => void;
    _reject_progress: (e?: any) => void;

    _results_prom: Promise<R>;
    _resolve_result: (r: R) => void;
    _reject_result: (e?: any) => void;

    constructor(fun?: (setProgress: (progress: P) => void) => PromiseLike<R>) {

        this._results_prom = new Promise((resolve, reject) => {
            this._resolve_result = resolve;
            this._reject_result = reject;
        });

        this._progress_prom = new Promise((resolve, reject) => {
            this._resolve_progress = resolve;
            this._reject_progress = reject;
        });

        let self = this;
        this.setProgress = function(progress: P) {
            self._progress = progress;
            self._resolve_progress();
        };

        if (fun !== undefined) {
            fun(this.setProgress)
                .then((result) => {
                    this.resolve(result);
                }, (error) => {
                    this.reject(error);
                });
        }
    }

    resolve(result) {
        this._progress_prom.catch(() => {});
        this._reject_progress();
        this._resolve_result(result);
    }

    reject(error) {
        this._reject_progress(error);
        this._reject_result(error);
    }

    then<TResult1 = R, TResult2 = never>(onfulfilled?: ((value: R) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): PromiseLike<TResult1 | TResult2> {
        return this._results_prom.then(onfulfilled, onrejected);
    }

    [Symbol.asyncIterator]() {
        var self = this;
        return {
            async next(): Promise<IteratorResult<P>> {
                try {
                    await self._progress_prom;
                    self._progress_prom = new Promise((resolve, reject) => {
                        self._resolve_progress = resolve;
                        self._reject_progress = reject;
                    });
                    return { done: false, value: self._progress };
                } catch (e) {
                    if (e)
                        throw e;
                    else
                        return { done: true, value: undefined };
                }
            }
        };
    }
}

export default ProgressStream;
