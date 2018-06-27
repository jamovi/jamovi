
#ifndef VARTYPES_H
#define VARTYPES_H

namespace DataType
{
    enum Type
    {
        NONE = 0,
        INTEGER = 1,
        DECIMAL = 2,
        TEXT = 3
    };
}

namespace MeasureType
{
    enum Type
    {
        NONE = 0,
        NOMINAL = 2,
        ORDINAL = 3,
        CONTINUOUS = 4,
        ID = 5
    };
}

#endif // VARTYPES_H
