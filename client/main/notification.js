
'use strict';

const Backbone = require('backbone');

const Notify = Backbone.Model.extend({

    initialize(args) {
        args = args || {};
        this.duration = args.duration || 0;
    },
    defaults : {
        id : undefined,
        title : '(no title)',
        message : null,
        visible : true,
        type: 'info',
        progress: [0, 0],
        dismissed: false,
        cancel: null,
    },
    dismiss() {
        this.set('dismissed', true);
    },
    cancel() {
        if (this.attributes.cancel)
            this.attributes.cancel();
        this.dismiss();
    },
});

function sessionShutdownMessage(seconds) {
    let nearest30secs = parseInt(seconds / 30) * 30;
    if (nearest30secs >= 120)
        return _('This session will end in around {} minutes').replace('{}', parseInt(nearest30secs / 60));
    else if (nearest30secs >= 60)
        return _('This session will end in around 1 minute');
    else
        return _('This session will end any moment now');
}


const NOTIFICATION_TRANSIENT = 0;
const NOTIFICATION_DISMISS = 1;
const NOTIFICATION_INDEFINITE = 2;


const SESSION_SHUTDOWN_IDLE = 1;
const SESSION_SHUTDOWN_MAINTENANCE = 2;
const SESSION_SHUTDOWN_TIME_LIMIT = 3;

Notify.createFromPB = function(pb) {

    let id = pb.id;
    let status = pb.status;
    let dismissed = (status === NOTIFICATION_DISMISS);
    let duration = (status === NOTIFICATION_TRANSIENT ? 4000 : 0);

    let title;
    let message;
    let values;

    if (status !== NOTIFICATION_DISMISS) {
        values = { };

        for (let valuePB of pb.values) {
            let name = valuePB.name;
            let value = valuePB[valuePB.value];
            values[name] = value;
        }

        switch (id) {
        case SESSION_SHUTDOWN_IDLE:
            title = _('Idle session');
            message = sessionShutdownMessage(values.shutdownIn);
            break;
        case SESSION_SHUTDOWN_MAINTENANCE:
            title = _('Scheduled maintenance');
            message = sessionShutdownMessage(values.shutdownIn);
            break;
        case SESSION_SHUTDOWN_TIME_LIMIT:
            title = _('Approaching plan time limit');
            message = sessionShutdownMessage(values.shutdownIn);
            break;
        default:
            title = _('Unexpected error');
            message = 'Unknown event'; // not translated, because it will be
                                       // helpful for us to be able to read it!
            break;
        }
    }

    return new Notify({ id, title, message, duration, dismissed });
};

module.exports = Notify;
