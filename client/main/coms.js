
'use strict';

var $ = require('jquery');
var ProtoBuf = require('protobufjs');
var Q = require('q');

var Coms = function() {

    this._baseUrl = null;
    this._transId = 0;
    this._transactions = [ ];
    this._broadcastListeners = [ ];

    var self = this;

    this.connected = null;

    this.ready = new Promise(function(resolve, reject) {
        self._notifyReady = resolve;
    });
};

Coms.prototype.setBaseUrl = function(url) {
    this._baseUrl = url;
    this._notifyReady();
};

Coms.prototype.connect = function(sessionId) {

    var self = this;

    if ( ! this.connected) {

        this.connected = Promise.all([

            new Promise(function(resolve, reject) {

                var protoUrl = 'http://' + self._baseUrl + '/proto/coms.proto';

                ProtoBuf.loadProtoFile(protoUrl, function(err, builder) {
                    if (err) {
                        reject(err);
                    }
                    else {
                        self.Messages = builder.build().silkycoms;
                        resolve();
                    }
                });
            }),
            new Promise(function(resolve, reject) {

                var url = 'ws://' + self._baseUrl + '/coms';

                if (sessionId)
                    url += '/' + sessionId;

                self._ws = new WebSocket(url);
                self._ws.binaryType = 'arraybuffer';

                self._ws.onopen = function() {
                    console.log('opened!');
                    resolve();
                };

                self._ws.onmessage = function(event) {
                    self.receive(event);
                };

                self._ws.onerror = reject;
                self._ws.onclose = function(msg) {
                    console.log('websocket closed!');
                    console.log(msg);
                };
            })
        ]);
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

    var response = this.Messages.ComsMessage.decode(event.data);

    if (response.id === 0) {
        this._notifyBroadcast(response);
        return;
    }

    var found = false;

    for (var i = 0; i < this._transactions.length; i++) {

        var trans = this._transactions[i];
        if (trans.id === response.id) {
            found = true;
            if (response.status === this.Messages.Status.COMPLETE)
                trans.resolve(response);
            else
                trans.onprogress(response);
            break;
        }
    }

    if ( ! found)
        this._notifyBroadcast(response);

};

Coms.prototype._notifyBroadcast = function(broadcast) {
    for (var i = 0; i < this._broadcastListeners.length; i++)
        this._broadcastListeners[i](broadcast);
};

Coms.prototype.onBroadcast = function(callback) {
    this._broadcastListeners.push(callback);
};

module.exports = Coms;
