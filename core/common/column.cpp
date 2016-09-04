//
// Copyright (C) 2016 Jonathon Love
//

#include "column.h"

#include <stdexcept>
#include <climits>
#include <sstream>
#include <cstring>

#include "dataset.h"

using namespace std;

Column::Column(DataSet *parent, MemoryMap *mm, ColumnStruct *rel)
{
    _parent = parent;
    _mm = mm;
    _rel = rel;
}

const char *Column::name() const
{
    return _mm->resolve(struc()->name);
}

MeasureType::Type Column::measureType() const
{
    return (MeasureType::Type) struc()->measureType;
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

const char *Column::getLabel(int value) const
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

    stringstream ss;
    ss << "level " << value << " not found";
    throw runtime_error(ss.str());
}

int Column::getValue(const char *label) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        const char *l = _mm->resolve(level.label);
        if (strcmp(l, label) == 0)
            return level.value;
    }

    stringstream ss;
    ss << "level '" << label << "' not found";
    throw runtime_error(ss.str());
}

bool Column::hasLevel(const char *label) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        const char *l = _mm->resolve(level.label);
        if (strcmp(l, label) == 0)
            return true;
    }

    return false;
}

bool Column::hasLevel(int value) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        if (level.value == value)
            return true;
    }

    return false;
}
