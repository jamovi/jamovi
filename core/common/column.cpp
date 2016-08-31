//
// Copyright (C) 2016 Jonathon Love
//

#include "column.h"

#include <stdexcept>
#include <climits>

#include "dataset.h"

using namespace std;

Column::Column(DataSet *parent, MemoryMap *mm, ColumnStruct *rel)
{
    _parent = parent;
    _mm = mm;
    _rel = rel;
}

string Column::name() const
{
    return string(this->c_str());
}

const char *Column::c_str() const
{
    return _mm->resolve(struc()->name);
}

Column::ColumnType Column::columnType() const
{
    return (Column::ColumnType) struc()->columnType;
}

int Column::rowCount() const {
    return struc()->rowCount;
}

int Column::dps() const
{
    return struc()->dps;
}

ColumnStruct *Column::struc() const
{
    return _mm->resolve(_rel);
}

int Column::levelCount() const
{
    return struc()->levelsUsed;
}

map<int, string> Column::levels() const
{
    map<int, string> m;

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        m[l.value] = _mm->resolve(l.label);
    }

    return m;
}

const char *Column::getLevel(int value)
{
    if (value == INT_MIN)
        return "";

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        if (l.value == value)
            return _mm->resolve(l.label);
    }

    throw runtime_error("level not found");
}
