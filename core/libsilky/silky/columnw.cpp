//
// Copyright (C) 2016 Jonathon Love
//

#include "columnw.h"

#include <stdexcept>
#include <climits>

#include "dataset.h"

using namespace std;

ColumnW::ColumnW(DataSetW *parent, MemoryMapW *mm, ColumnStruct *rel)
    : Column(parent, mm, rel)
{
    _mm = mm;
}

void ColumnW::setColumnType(Column::ColumnType columnType)
{
    struc()->columnType = (char)columnType;
}

void ColumnW::setDPs(int dps)
{
    struc()->dps = dps;
}

void ColumnW::addLabel(int value, const char *label)
{
    ColumnStruct *s = struc();

    if (s->labelsUsed + 1 >= s->labelsCapacity)
        throw runtime_error("max labels reached");

    int length = strlen(label)+1;
    size_t allocated;

    char *chars = _mm->allocate<char>(length, &allocated);

    std::memcpy(chars, label, length);

    s = struc();
    Label &l = _mm->resolve(s->labels)[s->labelsUsed];

    l.value = value;
    l.capacity = allocated;
    l.label = _mm->base(chars);

    s->labelsUsed++;
}

void ColumnW::clearLabels()
{
    struc()->labelsUsed = 0;
}
