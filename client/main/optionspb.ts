//
// Copyright (C) 2016 Jonathon Love
//

'use strict';

const optionPB = { 
    toPB: function(options, extra, Messages) {
        let names = [ ];
        let optionsPB = [ ];

        if (options._options !== undefined) {
            for (let name in options._options) {
                let value = options.getOption(name).getValue();
                if (value !== undefined) {
                    names.push(name);
                    optionsPB.push(_toPB(value, Messages));
                }
            }
        }
        else {
            for (let name in options) {
                let value = options[name];
                names.push(name);
                optionsPB.push(_toPB(value, Messages));
            }
        }

        for (let name in extra) {
            let value = extra[name];
            names.push(name);
            optionsPB.push(_toPB(value, Messages));
        }

        let child = new Messages.AnalysisOptions();
        child.setOptions(optionsPB);
        child.setNames(names);
        child.setHasNames(true);

        return child;
    },

    fromPB: function(optionsPB, Messages) {

        let value = { };

        for (let j = 0; j < optionsPB.names.length; j++) {
            let name = optionsPB.names[j];
            let option = optionsPB.options[j];
            value[name] = _fromPB(option, Messages);
        }

        return value;
    }
}

const _toPB = function(value, Messages) {

    if (value === true) {
        let option = new Messages.AnalysisOption();
        option.setO(Messages.AnalysisOption.Other.TRUE);
        option.type = 'o';
        return option;
    }
    else if (value === false) {
        let option = new Messages.AnalysisOption();
        option.setO(Messages.AnalysisOption.Other.FALSE);
        option.type = 'o';
        return option;
    }
    else if (value === null) {
        let option = new Messages.AnalysisOption();
        option.setO(Messages.AnalysisOption.Other.NONE);
        option.type = 'o';
        return option;
    }
    else if (Number.isInteger(value)) {
        let option = new Messages.AnalysisOption();
        option.setI(value);
        option.type = 'i';
        return option;
    }
    else if (typeof value === 'number') {
        let option = new Messages.AnalysisOption();
        option.setD(value);
        option.type = 'd';
        return option;
    }
    else if (typeof value === 'string') {
        let option = new Messages.AnalysisOption();
        option.setS(value);
        option.type = 's';
        return option;
    }
    else if (Array.isArray(value)) {

        let options = new Array(value.length);

        let arrayify = false;
        for (let i = 0; i < value.length; i++) {
            if (Array.isArray(value[i])) {
                arrayify = true;
                break;
            }
        }

        for (let i = 0; i < value.length; i++) {
            let option = value[i];
            if (arrayify && ! Array.isArray(option))
                option = [ option ];
            options[i] = _toPB(option, Messages);
        }

        let child = new Messages.AnalysisOptions();
        child.setOptions(options);
        child.setHasNames(false);

        let option = new Messages.AnalysisOption();
        option.setC(child);
        option.type = 'c';
        return option;
    }
    else if (typeof(value) === 'object') {

        let names = [ ];
        let options = [ ];

        for (let name in value) {
            names.push(name);
            options.push(_toPB(value[name], Messages));
        }

        let child = new Messages.AnalysisOptions();
        child.setOptions(options);
        child.setNames(names);
        child.setHasNames(true);

        let option = new Messages.AnalysisOption();
        option.setC(child);
        option.type = 'c';
        return option;
    }
    else {
        throw "shouldn't get here";
    }
};
const _fromPB = function(option, Messages) {

    let value;

    if (option.type === 'c') {
        let options = option.c;
        if (options.hasNames) {
            value = { };
            for (let j = 0; j < options.names.length; j++) {
                let name = options.names[j];
                let option = options.options[j];
                value[name] = _fromPB(option, Messages);
            }
        }
        else {
            value = new Array(options.options.length);
            for (let j = 0; j < options.options.length; j++) {
                let option = options.options[j];
                value[j] = _fromPB(option, Messages);
            }
        }
    }
    else if (option.type === 'o') {
        if (option.o === Messages.AnalysisOption.Other.TRUE)
            value = true;
        else if (option.o === Messages.AnalysisOption.Other.FALSE)
            value = false;
        else
            value = null;
    }
    else {
        value = option[option.type];
    }

    return value;
};

export default optionPB;
