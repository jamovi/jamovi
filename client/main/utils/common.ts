
export class Future<T> extends Promise<T> {

    resolve: (value: T | PromiseLike<T>) => void
    reject: (reason?: any) => void;

    constructor() {
        let res, rej;
        super((resolve, reject) => {
            res = resolve;
            rej = reject;
        });
        this.resolve = res;
        this.reject = rej;
    }

    // you apparently need this if you're subclassing a promise
    static get [Symbol.species]() {
        return Promise;
    }
}
