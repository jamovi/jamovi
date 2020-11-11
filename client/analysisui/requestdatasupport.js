'use strict';

var SuperClass = require('../common/superclass');

var RequestDataSupport = function() {

    this._requestedDataSource = null;
    this.setRequestedDataSource = function(supplier) {
        this._requestedDataSource = supplier;
    };

    this.requestData = function(requestId, requestData) {
        return this._requestedDataSource.requestData(requestId, requestData);
    };

    this.requestAction = function(requestId, requestData) {
        return this._requestedDataSource.requestAction(requestId, requestData);
    };
};

SuperClass.create(RequestDataSupport);

module.exports = RequestDataSupport;
