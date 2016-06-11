
'use strict';

var $ = require('jquery');
var ProtoBuf = require('protobufjs');
var Q = require('q');

var Coms = function() {

    this._baseUrl = null;
    this._transId = 0;
    this._transactions = [ ];

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

Coms.prototype.send = function(request) {

    var self = this;

    return new Q.promise(function(resolve, reject, onprogress) {

        self._transId++;

        request.id = self._transId;
        self._ws.send(request.toArrayBuffer());

        self._transactions.push({
            id : self._transId,
            resolve : resolve,
            reject  : reject,
            onprogress : onprogress,
            requestTime : new Date()
        });
    });
};

Coms.prototype.receive = function(event) {

    var response = this.Messages.ComsMessage.decode(event.data);

    for (var i = 0; i < this._transactions.length; i++) {

        var trans = this._transactions[i];
        if (trans.id === response.id) {
            if (response.status === this.Messages.Status.COMPLETE)
                trans.resolve(response);
            else
                trans.onprogress(response);
            break;
        }
    }
};

module.exports = Coms;
