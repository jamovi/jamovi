
'use strict';

const EnumPropertyFilter = require('./enumpropertyfilter');
import { HTMLElementCreator as HTML }  from '../common/htmlelementcreator';

const get = function(parent) {

    let icons = parent.getPropertyValue('icons');
    let iconPosition = parent.getPropertyValue('iconPosition');
    let el = HTML.parse('<div class="jmv-option-icons" data-icon-position="' + iconPosition + '"></div>');
    for (let i = 0; i < icons.length; i++) {
        let icon = HTML.parse('<div class="jmv-option-icon" data-icon="' + icons[i] + '"></div>');
        el.append(icon);
    }

    return el;
};

const addSupport = function(parent) {
    parent.registerSimpleProperty("icons", null);
    parent.registerSimpleProperty("iconPosition", "right", new EnumPropertyFilter(["left", "right", "above", "below"], "right"));
};

const exists = function(parent) {
    return parent.hasProperty('icons') && parent.getPropertyValue('icons') !== null;
};

const position = function(parent) {
    return parent.getPropertyValue('iconPosition');
};

module.exports = { get, exists, position, addSupport };
