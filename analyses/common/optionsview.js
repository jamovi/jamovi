var _ = require('underscore')
var $ = require('jquery')
var Backbone = require('backbone')
Backbone.$ = $

var OptionsView = Backbone.View.extend({

    initialize: function() {
        _.bindAll(this, 'optionChanged');
    },

    events: {
      "change .silky-option-input":  "optionChanged"
    },

    getTitle: function() {
        return this.title ? this.title : "Undefined";
    },

    getOptionText: function(id) {
        if (this.optionText) {
            if (this.optionText[id]) {
                var value = this.optionText[id];
                if ($.isFunction(value))
                    return value.call(this);
                else
                    return value;
            }
        }
        return id;
    },

    render: function() {

        var options = this.model.get('options');

        for (var i = 0; i < options.length; i++) {
            var option = options[i];
            this.$el.append(this._createInput(option));
            this.$el.append('<br>')

            this._checkForOverrideFunction("Rendered", null, option)
        }
    },

    _checkForOverrideFunction: function(action, data, option) {
        var baseFunctionName = 'on' + action;
        var renderFunction;

        if (option)
            renderFunction = this[baseFunctionName + '_' + option.id];
        else
            renderFunction = this[baseFunctionName];

        if (renderFunction)
            return renderFunction.call(this, { data: data, option: option } );

        return data;
    },

    _createInput: function(option) {

        var createFunction = this['_create' + option.type + 'Option'];
        if (createFunction)
            t = createFunction.call(this, option);
        else
            t = '[No Renderer Avaliable]';

        return t;
    },

    _createIntOption: function(option) {

        var id = option.id;

        var t = '<div class="silky-option silky-option-text-input">'

        t += '<div class silky-option-text>' + this.getOptionText(id) + '</div>'
        t += '<input id="' + id + '" class="silky-option-input silky-option-value" style="display: inline" type="text" value="' + option.toString() + '"';

        if (option.inputPattern)
            t += ' pattern="'+ option.inputPattern +'"';

        t += '>';
        t += '</div>';

        t = this._checkForOverrideFunction('Render', t, option);

        return t;
    },

    _createVariablesOption: function(option) {
        var dataSet = this.model.get('dataSetModel');

        return "<div>Variables</div>";
    },

    _createBoolOption: function(option) {
        var id = option.id;
        var t = '<div class="silky-option silky-option-checked-input">'
        t += '<input id="' + id + '" class="silky-option-input silky-option-value" type="checkbox"' + (option.getValue() ? ' checked' : '') + '>';
        t += '<div class="silky-option-text" style="display: inline">' + this.getOptionText(id) + '</div>'
        t += '</div>';

        t = this._checkForOverrideFunction('Render', t, option);

        return t;
    },

    optionChanged: function(e) {

        this.model.beginEdit();

        var option = e.currentTarget;
        var $option = $(option);
        if (option.validity.valid === false) {
            $option.addClass("silky-options-option-invalid")
        }
        else {
            $option.removeClass("silky-options-option-invalid")

            var optionId = option.id;
            var optionObject = this.model.getOption(optionId);

            var value = $option.val();
            if (option.type === "checkbox")
                value = option.checked;

            value = this._checkForOverrideFunction('ValueChanged', value, optionObject);

            this.model.setOptionValue(optionObject, value);

            //optionObject.setValue(value);

            this.model.endEdit();

            // if you use local storage save
            //this.model.save(obj);

            // if you send request to server is prob. good idea to set the var and save at the end, in a blur event or in some sync. maintenance timer.
            //this.model.set(obj);
        }
    }
})


module.exports = OptionsView;
