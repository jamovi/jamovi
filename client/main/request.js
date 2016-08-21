
'use strict';


const Backbone = require('backbone');

var Request = Backbone.Model.extend({

    initialize: function() {
        this._p = new Promise((resolve, reject) => {
            this._resolve = resolve;
            this._reject = reject;
        });

        this.title = '(no title)';
        this.notifyOnError = true;
        this.notifyAlways = false;
        this.showProgress = false;
        this.duration = 0; // ms
        this.cancelable = false;
        this.dismissable = true;
        this.waitable = false;
        this.parent = null;
    },
    defaults : {
        data : null,
        complete : false,
        success : false,
        progress : 0,
        content : null,
        description : null,
        errorMessage : null,
        errorCause : null,
        position : 'main',
        linkText : 'Ok',
        hideOnAction : true,
        visible : true,
        timeToFade : 0,
        index : 0,
    },
    linkAction : function(){},
    resolve : function(arg) {
        this.set({
            success: true,
            progress: 100,
        });
        this._resolve(arg);
    },
    reject : function(arg) {
        this.set({
            success: false,
            errorMessage: arg.message,
            errorCause: arg.cause,
        });
        this._reject(arg);
    },
    then : function(then, catc) {
        this._p.then(then, catc);
    },
    waitOn : function(promise) {
        promise.then(v => this.resolve(v), e => this.reject(e));
    },
});

module.exports = Request;
