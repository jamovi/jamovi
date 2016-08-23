
'use strict';

const Backbone = require('backbone');

const Notify = Backbone.Model.extend({

    initialize: function(args) {
        this.title = args.title || '(no title)';
        this.duration = 0; // ms
    },
    defaults : {
        visible: true,
        message : null,
    }
});

module.exports = Notify;
