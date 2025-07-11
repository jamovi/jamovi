
'use strict';

import $ from 'jquery';
import Backbone from 'backbone';
Backbone.$ = $;

const View = Backbone.View.extend({

    _isClosed: false,

	/** Removes DOM tree elements and any listeners from or too the view object */
    close: function () {
        if ( ! this._isClosed) {
            if (this.onClose)
                this.onClose();

            this.remove();
            this.off();
            this._isClosed = true;
        }
    }
});

export default View;
