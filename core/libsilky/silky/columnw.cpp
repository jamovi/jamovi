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

void ColumnW::setName(const char *name)
{
    int length = strlen(name)+1;

    char *chars = _mm->allocate<char>(length);

    std::memcpy(chars, name, length);

    ColumnStruct *s = struc();

    s->name = _mm->base(chars);
    s->changes++;
}

void ColumnW::setMeasureType(MeasureType::Type measureType)
{
    ColumnStruct *s = struc();
    s->measureType = (char)measureType;
    s->changes++;

    if (measureType == MeasureType::CONTINUOUS)
        setRowCount<double>(rowCount()); // keeps the row count the same, but allocates space for doubles
}

void ColumnW::setAutoMeasure(bool yes)
{
    ColumnStruct *s = struc();
    s->autoMeasure = yes;
    s->changes++;
}

void ColumnW::setDPs(int dps)
{
    ColumnStruct *s = struc();
    s->dps = dps;
    s->changes++;
}

void ColumnW::appendLevel(int value, const char *label)
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
                newLevel = oldLevel;
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
    l.count = 0;

    s->levelsUsed++;
    s->changes++;
}

void ColumnW::insertLevel(int value, const char *label)
{
    appendLevel(value, label); // add to end

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);
    int lastIndex = s->levelsUsed - 1;
    char *baseLabel = levels[lastIndex].label;

    bool ascending = true;
    bool descending = true;
    for (int i = 0; i < lastIndex - 1; i++) {
        Level &level = levels[i];
        Level &nextLevel = levels[i+1];
        if (ascending && level.value > nextLevel.value)
            ascending = false;
        if (descending && level.value < nextLevel.value)
            descending = false;
    }

    if (ascending == false && descending == false)
    {
        // if the levels are neither ascending nor descending
        // then just add the level to the end

        Level &level = levels[lastIndex];
        level.value = value;
        level.label = baseLabel;
        level.count = 0;
    }
    else
    {
        bool inserted = false;

        for (int i = lastIndex - 1; i >= 0; i--)
        {
            Level &level = levels[i];
            Level &nextLevel = levels[i+1];
            if (ascending && level.value > value)
            {
                nextLevel = level;
            }
            else if (descending && level.value < value)
            {
                nextLevel = level;
            }
            else
            {
                nextLevel.value = value;
                nextLevel.label = baseLabel;
                inserted = true;
                break;
            }
        }

        if ( ! inserted)
        {
            Level &level = levels[0];
            level.value = value;
            level.label = baseLabel;
            level.count = 0;
        }
    }

    s->changes++;
}

void ColumnW::removeLevel(int value)
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    int i = 0;

    for (; i < s->levelsUsed; i++)
    {
        if (levels[i].value == value)
            break;
    }

    assert(i != s->levelsUsed); // level not found

    int index = i;

    for (; i < s->levelsUsed - 1; i++)
        levels[i] = levels[i+1];

    s->levelsUsed--;

    if (measureType() == MeasureType::NOMINAL_TEXT)
    {
        // consolidate levels

        for (int i = index; i < s->levelsUsed; i++)
            levels[i].value--;

        for (int i = 0; i < rowCount(); i++) {
            int &v = this->cellAt<int>(i);
            if (v > value)
                v--;
        }
    }

    s->changes++;
}

void ColumnW::clearLevels()
{
    ColumnStruct *s = struc();
    s->levelsUsed = 0;
    s->changes++;
}

int ColumnW::changes() const
{
    return struc()->changes;
}
