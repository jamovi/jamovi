
export type RequestDataSupport = {
    _requestedDataSource: any;
    setRequestedDataSource: (supplier) => void;
    requestData: (requestId, requestData) => any;
    requestAction: (requestId, requestData) => any;
    dataSourceId: () => any;
};

export const GetRequestDataSupport = function<T>(obj: T) : T & RequestDataSupport {

    let support: RequestDataSupport = { 
        _requestedDataSource: null,

        setRequestedDataSource: function(supplier) {
            this._requestedDataSource = supplier;
        },

        requestData: function(requestId, requestData) {
            return this._requestedDataSource.requestData(requestId, requestData);
        },

        requestAction: function(requestId, requestData) {
            return this._requestedDataSource.requestAction(requestId, requestData);
        },

        dataSourceId: function() {
            return this._requestedDataSource.id;
        }
    };

    return Object.assign(obj, support);
};

export default GetRequestDataSupport;
