
'use strict';

const Backbone = require('backbone');

const Notify = Backbone.Model.extend({

    initialize: function(args) {
        this.title    = args.title || '(no title)';
        this.duration = args.duration || 0;
    },
    defaults : {
        visible: true,
        message : null,
    }
});

module.exports = Notify;
