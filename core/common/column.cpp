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

int Column::dps() const
{
    return struc()->dps;
}

ColumnStruct *Column::struc() const
{
    return _mm->resolve(_rel);
}

int Column::labelCount() const
{
    return struc()->labelsUsed;
}

map<int, string> Column::labels() const
{
    map<int, string> m;

    ColumnStruct *s = struc();
    Label *labels = _mm->resolve(s->labels);

    for (int i = 0; i < s->labelsUsed; i++)
    {
        Label &l = labels[i];
        m[l.value] = _mm->resolve(l.label);
    }

    return m;
}

const char *Column::getLabel(int value)
{
    if (value == INT_MIN)
        return "";

    ColumnStruct *s = struc();
    Label *labels = _mm->resolve(s->labels);

    for (int i = 0; i < s->labelsUsed; i++)
    {
        Label &l = labels[i];
        if (l.value == value)
            return _mm->resolve(l.label);
    }

    throw runtime_error("label not found");
}
