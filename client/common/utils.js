
'use strict';

module.exports = {
    s6e: function(x) {
        return x.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
