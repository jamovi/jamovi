
'use strict';

const Backbone = require('backbone');

const Notify = Backbone.Model.extend({

    initialize(args) {
        this.duration = args.duration || 0;
    },
    defaults : {
        title : '(no title)',
        message : null,
        visible : true,
        type: 'info',
    }
});

module.exports = Notify;
