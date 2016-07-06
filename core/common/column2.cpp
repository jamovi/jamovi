//
// Copyright (C) 2016 Jonathon Love
//

#include "column2.h"

#include <stdexcept>
#include <climits>

#include "dataset2.h"

using namespace std;

Column2::Column2(DataSet2 *parent, MemoryMap *mm, ColumnStruct *rel)
{
    _parent = parent;
    _mm = mm;
    _rel = rel;
}

string Column2::name() const
{
    return string(this->c_str());
}

const char *Column2::c_str() const
{
    return _mm->resolve(struc()->name);
}

Column2::ColumnType Column2::columnType() const
{
    return (Column2::ColumnType) struc()->columnType;
}

ColumnStruct *Column2::struc() const
{
    return _mm->resolve(_rel);
}

int Column2::labelCount() const
{
    return struc()->labelsUsed;
}

map<int, string> Column2::labels() const
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

const char *Column2::getLabel(int value)
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
