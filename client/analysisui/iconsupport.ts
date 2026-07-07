
'use strict';

import EnumPropertyFilter from './enumpropertyfilter';
import { attrs, h }  from '../common/htmlelementcreator';

const get = function(parent) {

    let icons = parent.getPropertyValue('icons');
    let iconPosition = parent.getPropertyValue('iconPosition');
    let el = h('div', attrs({ class: 'jmv-option-icons', 'data-icon-position': iconPosition }));
    for (let i = 0; i < icons.length; i++) {
        let icon = h('div', attrs({ class: 'jmv-option-icon', 'data-icon': icons[i] }));
        el.append(icon);
    }

    return el;
};

enum Position {
    Left = "left",
    Right = "right",
    Above = "above",
    Below = "below"
}

const addSupport = function(parent) {
    parent.registerSimpleProperty("icons", null);
    parent.registerSimpleProperty("iconPosition", Position.Right, new EnumPropertyFilter(Position, Position.Right));
};

const exists = function(parent) {
    return parent.hasProperty('icons') && parent.getPropertyValue('icons') !== null;
};

const position = function(parent) {
    return parent.getPropertyValue('iconPosition');
};

export default { get, exists, position, addSupport };
