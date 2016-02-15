
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $

var View = Backbone.View.extend({

    _isClosed: false,

	/** Removes DOM tree elements and any listeners from or too the view object */
    close: function () {
        if (!this._isClosed) {
            if (this.onClose)
                this.onClose();

            this.remove();
            this.off();
            this._isClosed = true;
        }
    }
})

module.exports = View
