
'use strict';

export class ProgressStream {

    constructor(fun) {

        this._progress = undefined;

        this._results_prom = new Promise((resolve, reject) => {
            this._resolve_result = resolve;
            this._reject_result = reject;
        });

        this._progress_prom = new Promise((resolve, reject) => {
            this._resolve_progress = resolve;
            this._reject_progress = reject;
        });

        let self = this;
        this.setProgress = function(progress) {
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

    then(onSuccess, onError) {
        return this._results_prom.then(onSuccess, onError);
    }

    [Symbol.asyncIterator]() {
        var self = this;
        return {
            async next() {
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
                        return { done: true };
                }
            }
        };
    }
}

export default ProgressStream;
