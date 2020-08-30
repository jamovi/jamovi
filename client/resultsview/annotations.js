
'use strict';

const Annotation = require('./annotation');
const Heading = require('./heading');
const formatIO = require('../common/utils/formatio');

const Annotations = { };

Annotations.controls = [];

Annotations.getControl = function(address, suffix) {
    let control = null;
    for (let ctrl of Annotations.controls) {
        if (ctrl.compareAddress(address, suffix)) {
            control = ctrl;
            break;
        }
    }

    if (control !== null && control.attached)
        return control;

    return null;
};

Annotations.updateContents = function(address, suffix) {
    let control = Annotations.getControl(address, suffix);

    if (control === null)
        return;

    let delta = window.getParam(address, suffix);

    if (delta)
        control.setContents(delta);
    else
        control.setContents(null);
};

Annotations.create = function(address, suffix, levelIndex, data) {

    let control = null;
    for (let ctrl of Annotations.controls) {
        if (ctrl.compareAddress(address, suffix)) {
            control = ctrl;
            break;
        }
    }

    if (control === null) {
        if (suffix === 'heading')
            control = new Heading(address, data.text);
        else
            control = new Annotation(address, suffix);
        Annotations.controls.push(control);
    }

    Annotations.activate(control, levelIndex);

    let delta = window.getParam(address, suffix);
    if (delta)
        control.setContents(delta);

    return control;
};

Annotations.activate = function(annotation, levelIndex) {

    annotation.setup(levelIndex);
    annotation.attach();

    formatIO.registerNodeObject(annotation.$el[0], annotation);
};

module.exports = Annotations;
