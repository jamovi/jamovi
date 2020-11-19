
'use strict';

const Backbone = require('backbone');

const Notify = Backbone.Model.extend({

    initialize(args) {
        args = args || {};
        this.duration = args.duration || 0;
    },
    defaults : {
        title : '(no title)',
        message : null,
        visible : true,
        type: 'info',
        progress: [0, 0],
        dismissed: false,
    },
    dismiss() {
        this.set('dismissed', true);
    },
});

module.exports = Notify;
