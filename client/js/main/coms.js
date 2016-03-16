
'use strict';

var $ = require('jquery');
var ProtoBuf = require('protobufjs');

var Coms = function() {

    this._baseUrl = null;
    this._transId = 0;
    this._transactions = [ ];
    
    var self = this;

    this.ready = new Promise(function(resolve, reject) {
        self._notifyReady = resolve;
    });
};

Coms.prototype.setBaseUrl = function(url) {
    this._baseUrl = url;
    this._notifyReady();
};

Coms.prototype.connect = function(url) {

    var self = this;

    return Promise.all([
        new Promise(function(resolve, reject) {
        
            ProtoBuf.loadProtoFile('s/proto/clientcoms.proto', function(err, builder) {
                if (err) {
                    reject(err);
                }
                else {
                    self.Messages = builder.build();
                    resolve();
                }
            });
        }),
        new Promise(function(resolve, reject) {

            self._ws = new WebSocket('ws://' + self._baseUrl + '/coms');

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
};

Coms.prototype.send = function(request) {

    var self = this;

    return new Promise(function(resolve, reject) {
    
        self._transId++;

        request.id = self._transId;
        self._ws.send(request.toArrayBuffer());
    
        self._transactions.push({
            id : self._transId,
            resolve : resolve,
            reject  : reject,
            requestTime : new Date()
        });
    });
};

Coms.prototype.receive = function(event) {
    
    var self = this;

    return new Promise(function(resolve, reject) {

        var reader = new FileReader();
        reader.onloadend = function() {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(event.data);

    }).then(function(arrayBuffer) {

        var response = self.Messages.Response.decode(arrayBuffer);
        
        for (var i = 0; i < self._transactions.length; i++) {
        
            var trans = self._transactions[i];
            if (trans.id === response.id)
                trans.resolve(response);
        }

    }).catch(function(err) {

        console.log(err);
    });
};

module.exports = Coms;
