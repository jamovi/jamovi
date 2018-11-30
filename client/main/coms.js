
'use strict';

const $ = require('jquery');
const ProtoBuf = require('protobufjs');
const Q = require('q');

const Coms = function() {

    this._baseUrl = null;
    this._transId = 0;
    this._transactions = [ ];
    this._listeners = [ ];

    this.connected = null;

    this.ready = new Promise((resolve, reject) => {
        this._notifyReady = resolve;
    });
};

Coms.prototype.setBaseUrl = function(url) {
    this._baseUrl = url;
    this._notifyReady();
};

Coms.prototype.connect = function(sessionId) {

    if ( ! this.connected) {

        this.connected = Q.all([

            new Q.promise((resolve, reject) => {

                let protoUrl = this._baseUrl + 'proto/coms.proto';

                ProtoBuf.loadProtoFile(protoUrl, (err, builder) => {
                    if (err) {
                        reject('Unable to load proto definitions');
                    }
                    else {
                        this.Messages = builder.build().jamovi.coms;
                        resolve();
                    }
                });
            }),
            new Q.promise((resolve, reject) => {

                let url = this._baseUrl + 'coms';
                url = url.replace('http', 'ws'); // http -> ws, https -> wss

                if (sessionId)
                    url += '/' + sessionId;

                this._ws = new WebSocket(url);
                this._ws.binaryType = 'arraybuffer';

                this._ws.onopen = () => {
                    resolve();
                };

                this._ws.onmessage = (event) => {
                    this.receive(event);
                };

                this._ws.onerror = reject;
                this._ws.onclose = (event) => {
                    if (event.code !== 1000 && event.code !== 1001)
                        this._notifyEvent('failure');
                    this._notifyEvent('closed');
                };
            })
        ]).timeout(1500, 'connection timed out');
    }

    return this.connected;
};

Coms.prototype.sendP = function(request) {
    this._transId++;
    request.id = this._transId;
    this._ws.send(request.toArrayBuffer());
};

Coms.prototype.send = function(request) {

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
};

Coms.prototype.receive = function(event) {

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

};

Coms.prototype.on = function(eventName, callback) {
    this._listeners.push({ eventName, callback });
};

Coms.prototype.off = function(eventName, callback) {
    this._listeners = this._listeners.filter(v => v.eventName !== eventName || v.callback !== callback);
};

Coms.prototype._notifyEvent = function(eventName, event) {
    for (let listener of this._listeners) {
        if (listener.eventName === eventName)
            listener.callback(event);
    }
};

module.exports = Coms;
