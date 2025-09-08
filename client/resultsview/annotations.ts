
'use strict';

import Annotation from './annotation';
import Heading from './heading';
import {registerNodeObject} from '../common/utils/formatio';

export interface AnnotationAction {
    type: 'authentication' | 'copy' | 'paste' | 'cut' | 'undo' | 'redo' | 'format' | 'clean';
    name: string;
    value: any;
}

export interface IAnnotation extends HTMLElement {
    setContents: (delta: any) => void;
    compareAddress: (address: string[], suffic: string) => boolean;
    setup: (level: number) => void;
    attach: () => void;
    suffix: string;
    processToolbarAction: (action: AnnotationAction) => void;
}

export interface IAnnotations {
    controls: IAnnotation[];
    getControl: (address: string[], suffix: string) => IAnnotation;
    updateContents: (address: string[], suffix: string) => void;
    create: (address: string[], suffix: string, levelIndex: number, text: string) => IAnnotation;
    activate: (annotation: IAnnotation, levelIndex: number) => void;
}

const Annotations: IAnnotations = { 

    controls: [],

    getControl: function(address: string[], suffix: string): IAnnotation {
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
    },

    updateContents: function(address: string[], suffix: string) {
        let control = Annotations.getControl(address, suffix);

        if (control === null)
            return;

        let delta = window.getParam(address, suffix);

        if (delta)
            control.setContents(delta);
        else
            control.setContents(null);
    },

    create: function(address: string[], suffix: string, levelIndex: number, text: string): IAnnotation {

        let control: IAnnotation = null;
        for (let ctrl of Annotations.controls) {
            if (ctrl.compareAddress(address, suffix)) {
                control = ctrl;
                break;
            }
        }

        if (control === null) {
            if (suffix === 'heading')
                control = new Heading(address, text);
            else
                control = new Annotation(address, suffix, text);
            Annotations.controls.push(control);
        }

        Annotations.activate(control, levelIndex);

        let delta = window.getParam(address, suffix);
        if (delta)
            control.setContents(delta);

        return control;
    },

    activate: function(annotation: IAnnotation, levelIndex: number) {

        annotation.setup(levelIndex);
        annotation.attach();

        registerNodeObject(annotation, annotation);
    }

};

export default Annotations;
