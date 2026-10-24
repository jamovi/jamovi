'use strict';

// an async task that reports progress as it runs. iterate over it (for
// await) for the progress, then await it for the result (or the error).
// iteration ends when the task does, whether it succeeds or fails. progress
// is conflated: a slow consumer sees only the latest progress, and none that
// arrives after the task ends.
//
//     new ProgressStream(async (progress) => { progress(p); return r; })
//
// or, where the task is settled from elsewhere:
//
//     const { stream, progress, resolve, reject } = ProgressStream.withResolvers();

export class ProgressStream<P, R> implements AsyncIterable<P>, PromiseLike<R> {

    private _result: Promise<R>;
    private _resolveResult!: (result: R | PromiseLike<R>) => void;
    private _rejectResult!: (error?: any) => void;

    private _progress!: P;
    private _pending: boolean = false;  // a progress yet to be read
    private _settled: boolean = false;

    // resolved (and replaced) whenever any of the above changes
    private _changed: Promise<void>;
    private _wake!: () => void;

    static withResolvers<P, R>() {
        const stream = new ProgressStream<P, R>();
        return {
            stream,
            progress: (progress: P) => stream._setProgress(progress),
            resolve: (result?: R | PromiseLike<R>) => stream._resolve(result),
            reject: (error?: any) => stream._reject(error),
        };
    }

    constructor(fun?: (progress: (progress: P) => void) => PromiseLike<R>) {

        this._result = new Promise((resolve, reject) => {
            this._resolveResult = resolve;
            this._rejectResult = reject;
        });

        this._changed = new Promise((resolve) => this._wake = resolve);

        if (fun !== undefined) {
            fun((progress) => this._setProgress(progress))
                .then((result) => {
                    this._resolve(result);
                }, (error) => {
                    this._reject(error);
                });
        }
    }

    private _notify() {
        const wake = this._wake;
        this._changed = new Promise((resolve) => this._wake = resolve);
        wake();
    }

    private _setProgress(progress: P) {
        if (this._settled)
            return;
        this._progress = progress;
        this._pending = true;
        this._notify();
    }

    private _resolve(result?: R | PromiseLike<R>) {
        if (this._settled)
            return;
        this._settled = true;
        this._resolveResult(result as R);
        this._notify();
    }

    private _reject(error?: any) {
        if (this._settled)
            return;
        this._settled = true;
        this._rejectResult(error);
        this._notify();
    }

    then<TResult1 = R, TResult2 = never>(onfulfilled?: ((value: R) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
        return this._result.then(onfulfilled, onrejected);
    }

    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<R | TResult> {
        return this._result.catch(onrejected);
    }

    finally(onfinally?: (() => void) | undefined | null): Promise<R> {
        return this._result.finally(onfinally);
    }

    [Symbol.asyncIterator](): AsyncIterator<P> {
        const self = this;
        return {
            async next(): Promise<IteratorResult<P>> {
                while ( ! self._pending && ! self._settled)
                    await self._changed;
                if (self._settled)
                    return { done: true, value: undefined };
                self._pending = false;
                return { done: false, value: self._progress };
            }
        };
    }
}

export default ProgressStream;
