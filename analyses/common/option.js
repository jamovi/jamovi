
var _ = require('underscore')

function Option(data) {

    this.getValue = function() {
        return this._value;
    }

    this.setValue = function(value)
    {
        var fValue = value;
        if (typeof this._value === 'string')
            fValue = this.parseValue(value);

        if (fValue !== this._value) {
            this._value = fValue;
            return true;
        }

        return false;
    };

    this.onInitialise = function(data) {
        this.data = data;
        if (_.isUndefined(data) === false) {

            if (_.isUndefined(data.default) === false)
                this.setValue(data.default);

            this.id = data.id;
            this.text = data.text;
        }
    };

    this.onInitialise(data);
}

module.exports = Option
