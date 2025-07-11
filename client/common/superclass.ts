
'use strict';

const SuperClass = { };

SuperClass.superClasses = { };

SuperClass._addInheritanceFunctionality = function(target) {
    target._override = function(functionName, callback) {
        let baseFunction = this[functionName];
        if (!baseFunction)
            baseFunction = null;

        this[functionName] = (_param1, _param2, _param3, _param4, _param5, _param6, _param7) => {
            return callback.call(this, baseFunction, _param1, _param2, _param3, _param4, _param5, _param6, _param7);
        };
    };

    target._isInheritedFrom = function(_class) {
        let className = _class.name.replace(".", "#");

        for (let i = 0; i < this._inheritedClasses.length; i++) {
            let scid = this._inheritedClasses[i];
            if (scid === className)
                return true;
        }

        return false;
    };
};

SuperClass.create = function(_class) {

    let className = _class.name.replace(".", "#");

    if (className in SuperClass.superClasses)
        throw "This name is already used for a superclass.";

    _class.extendTo = function(target, param1, param2, param3, param4, param5, param6, param7) {

        if (!target._inheritedClasses) {
            target._inheritedClasses = [];
            SuperClass._addInheritanceFunctionality(target);
        }
        else {
            for (let i = 0; i < target._inheritedClasses.length; i++) {
                let scid = target._inheritedClasses[i];
                if (scid === className)
                    return false;
            }
        }

        _class.call(target, param1, param2, param3, param4, param5, param6, param7);
        target._inheritedClasses.push(className);

        return true;
    };

    //SuperClass.superClasses[_class.name] = _class;
};

export default SuperClass;
