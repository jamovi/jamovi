
'use strict';

const $ = require('jquery');
const ProtoBuf = require('protobufjs');
const Q = require('q');

const host = require('./host');
const auth = require('./auth/auth');

class Coms {

    constructor() {

        this._baseUrl = null;
        this._transId = 0;
        this._transactions = [ ];
        this._listeners = [ ];

        this.connected = null;
        this.Messages = null;

        this.ready = Promise.resolve();
    }

    _loadProtoDefn() {
        if (this.Messages)
            return;

        return new Q.promise((resolve, reject) => {

            let protoUrl = `${ host.baseUrl }assets/coms.proto`;

            ProtoBuf.loadProtoFile(protoUrl, (err, builder) => {
                if (err) {
                    reject('Unable to load proto definitions');
                }
                else {
                    this.Messages = builder.build().jamovi.coms;
                    resolve();
                }
            });
        });
    }

    _connectWS(url) {
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

                if (host.isElectron && event.code === 1006) {
                    // this occurs when the computer hibernates
                    // so we should try reconnecting
                    this.connected = null;
                    this._opened = false;
                    setTimeout(() => {
                        this.connect().catch((error) => {
                            this._notifyEvent('failure');
                            this._notifyEvent('closed');
                        });
                    });
                }
                else {
                    if (this._opened && event.code !== 1000 && event.code !== 1001)
                        this._notifyEvent('failure');
                    this._notifyEvent('closed');
                }
            };
        });
    }

    connect() {

        if (this.connected)
            return this.connected;

        let url = `${ window.location.origin }${ window.location.pathname }coms`;
        url = url.replace('http', 'ws'); // http -> ws, https -> wss

        let defnsReady = this._loadProtoDefn();
        let wsReady = this._connectWS(url);

        this.connected = Q.all([
            defnsReady,
            wsReady,
        ]).timeout(15000, 'connection timed out');

        return this.connected;
    }

    send(request) {

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

    on(eventName, callback) {
        this._listeners.push({ eventName, callback });
    }

    off(eventName, callback) {
        this._listeners = this._listeners.filter(v => v.eventName !== eventName || v.callback !== callback);
    }

    _notifyEvent(eventName, event) {
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

module.exports = Coms;
