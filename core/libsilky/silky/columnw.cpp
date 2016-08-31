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

void ColumnW::addLevel(int value, const char *label)
{
    ColumnStruct *s = struc();

    if (s->levelsUsed + 1 >= s->levelsCapacity)
    {
        int oldCapacity = s->levelsCapacity;
        int newCapacity = (oldCapacity == 0) ? 50 : 2 * oldCapacity;

        Level *newLevels = _mm->allocate<Level>(newCapacity);
        s = struc();

        if (oldCapacity > 0)
        {
            Level *oldLevels = _mm->resolve(s->levels);

            for (int i = 0; i < s->levelsUsed; i++)
            {
                Level &oldLevel = oldLevels[i];
                Level &newLevel = newLevels[i];
                newLevel.value = oldLevel.value;
                newLevel.label = oldLevel.label;
            }
        }

        s->levels = _mm->base(newLevels);
        s->levelsCapacity = newCapacity;
    }

    int length = strlen(label)+1;
    size_t allocated;

    char *chars = _mm->allocate<char>(length, &allocated);

    std::memcpy(chars, label, length);

    s = struc();
    Level &l = _mm->resolve(s->levels)[s->levelsUsed];

    l.value = value;
    l.capacity = allocated;
    l.label = _mm->base(chars);

    s->levelsUsed++;
}

void ColumnW::clearLevels()
{
    struc()->levelsUsed = 0;
}
