
'use strict';

import ProtoBuf from 'protobufjs';
import Q from 'q';

import auth from './auth/auth';

import PROTO_DEFN from '../assets/coms.proto?raw';

interface ComsTransaction {
    id : number,
    resolve : (data: any) => void,
    reject  : (reason?: string) => void,
    onprogress : (progress: [number, number]) => void,
    requestTime : Date
}

export declare namespace QQ {
  export interface Promise<T> {
    then<TResult1 = T, TResult2 = never>(
      onFulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
      onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
      onProgress?: ((progress: any) => void) | undefined | null
    ): Promise<TResult1 | TResult2>;

    catch<TResult = never>(
      onRejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
    ): Promise<T | TResult>;

    finally<U>(onFinally: () => U | PromiseLike<U>): Promise<T>;
  }

  interface Deferred<T> {
    promise: Promise<T>;
    resolve(value?: T | PromiseLike<T>): void;
    reject(reason?: any): void;
    notify(progress: any): void;
    makeNodeResolver(): (err: any, value: T) => void;
  }

  function defer<T>(): Deferred<T>;
  function resolve<T>(value?: T | PromiseLike<T>): Promise<T>;
  function reject<T = never>(reason?: any): Promise<T>;
  function all<T>(promises: (T | PromiseLike<T>)[]): Promise<T[]>;
  function delay<T>(value: T, ms: number): Promise<T>;
}

class Coms {

    _transId: number = 0;
    _ws: WebSocket;
    _opened: boolean;
    Messages: any;
    ready: Promise<void>;
    _listeners: { eventName:string, callback: (...args: any[]) => void }[] = [];
    _transactions: ComsTransaction[] = [];

    constructor() {

        const builder = ProtoBuf.loadProto(PROTO_DEFN);
        this.Messages = builder.build().jamovi.coms;

        this.ready = Promise.resolve();
    }

    connect(): QQ.Promise<void> {

        let url = `${ window.location.origin }${ window.location.pathname }coms`;
        url = url.replace('http', 'ws'); // http -> ws, https -> wss

        return new Q.promise((resolve, reject) => {

            this._ws = new WebSocket(url);
            this._ws.binaryType = 'arraybuffer';
            this._opened = false;

            this._ws.onopen = () => {
                this._opened = true;
                resolve();
            };

            this._ws.onmessage = (event) => {
                this.receive(event);
            };

            this._ws.onerror = (err) => {
                if ( ! this._opened)
                    reject('WebSocket failed to connect');
            };

            this._ws.onclose = (event) => {

                if ( ! this._opened)
                    return;

                this._opened = false;

                if ([1000, 1001].includes(event.code))
                    // person is navigating away
                    // but just in case they aren't
                    this.reconnect([2000])
                else
                    this.reconnect([0, 200, 400, 600, 800])
            };
        });
    }

    reconnect(retries: number[]) {
        if (retries.length === 0) {
            this._notifyEvent('failure');
            return;
        }

        const retryIn = retries.shift();
        setTimeout(() => {
            this.connect().catch((err) => {
              this.reconnect(retries);
            });
        }, retryIn);
    }

    send(request): QQ.Promise<any> {

        return new Q.promise((resolve, reject, onprogress) => {

            this._transId++;

            request.id = this._transId;
            this._ws.send(request.toArrayBuffer());

            this._transactions.push({
                id : this._transId,
                resolve : resolve,
                reject  : reject,
                onprogress : onprogress,
                requestTime : new Date()
            });
        });
    }

    sendP(request) {
        this._transId++;
        request.id = this._transId;
        this._ws.send(request.toArrayBuffer());
    }

    receive(event) {

        let response = this.Messages.ComsMessage.decode(event.data);

        if (response.id === 0) {
            this._notifyEvent('broadcast', response);
            return;
        }

        let found = false;

        for (let i = 0; i < this._transactions.length; i++) {

            let trans = this._transactions[i];
            if (trans.id === response.id) {
                found = true;
                if (response.status === this.Messages.Status.COMPLETE)
                    trans.resolve(response);
                else if (response.status === this.Messages.Status.ERROR)
                    trans.reject(response.error);
                else if (response.status === this.Messages.Status.IN_PROGRESS)
                    trans.onprogress([ response.progress, response.progressTotal ]);
                else
                    console.log("Shouldn't get here!");
                break;
            }
        }

        if ( ! found)
            this._notifyEvent('broadcast', response);
    }

    on(eventName: string, callback: (...args: any[]) => void) {
        this._listeners.push({ eventName, callback });
    }

    off(eventName: string, callback: (...args: any[]) => void) {
        this._listeners = this._listeners.filter(v => v.eventName !== eventName || v.callback !== callback);
    }

    _notifyEvent(eventName: string, event?: any) {
        for (let listener of this._listeners) {
            if (listener.eventName === eventName)
                listener.callback(event);
        }
    }

    async post(url, init) {
        let headers = init.headers || { };
        let token = await auth.getAuthToken();
        if (token)
            headers.Authorization = `Bearer ${ token }`;
        init.headers = headers;
        init.method = 'POST';
        let response = await fetch(url, init);
        if ( ! response.ok)
            throw Error(`HTTP error code ${ response.status }`);
        return response;
    }

}

export default Coms;
