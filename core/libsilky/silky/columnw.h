//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMNW_H
#define COLUMNW_H

#include "datasetw.h"
#include "memorymapw.h"

#include <string>
#include <cmath>
#include <climits>

#include <cassert>

class DataSetW;

class ColumnW : public Column
{
public:

    ColumnW(DataSetW *parent = 0, MemoryMapW *mm = 0, ColumnStruct *rel = 0);

    void setMeasureType(MeasureType::Type measureType);
    void setAutoMeasure(bool yes);
    void appendLevel(int value, const char *label);
    void insertLevel(int value, const char *label);
    void removeLevel(int value);
    void clearLevels();
    void setDPs(int dps);

    int changes() const;

    template<typename T> void setValue(int rowIndex, T value, bool initing = false)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);

        if (measureType() != MeasureType::CONTINUOUS)
        {
            assert(sizeof(T) == 4);

            int newValue = (int)value;

            if (initing == false)
            {
                int oldValue = this->value<int>(rowIndex);
                if (oldValue == newValue)
                    return;

                if (oldValue != INT_MIN)
                {
                    Level *level = rawLevel(oldValue);
                    assert(level != NULL);
                    level->count--;
                    if (level->count == 0)
                        removeLevel(oldValue);
                }
            }

            if (newValue != INT_MIN)
            {
                Level *level = rawLevel(newValue);
                assert(level != NULL);
                level->count++;
            }
        }

        cellAt<T>(rowIndex) = value;
    }

    template<typename T> void setRowCount(size_t count)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);
        int blocksRequired = count * sizeof(T) / VALUES_SPACE + 1;

        for (int i = cs->blocksUsed; i < blocksRequired; i++)
        {
            Block *block = _mm->allocateSize<Block>(BLOCK_SIZE);
            cs = _mm->resolve<ColumnStruct>(_rel);
            Block **blocks = _mm->resolve<Block*>(cs->blocks);
            blocks[i] = _mm->base(block);
            cs->blocksUsed++;
        }

        int oldCount = cs->rowCount;
        cs->rowCount = count;

        for (size_t i = oldCount; i < count; i++) {
            if (sizeof(T) == 8)
                cellAt<double>(i) = NAN;
            else
                cellAt<int>(i) = INT_MIN;
        }
    }

    template<typename T> void append(const T &value)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);

        setRowCount<T>(cs->rowCount + 1);

        cs = _mm->resolve<ColumnStruct>(_rel);
        int blockIndex = cs->rowCount * sizeof(T) / VALUES_SPACE;
        Block **blocks = _mm->resolve<Block*>(cs->blocks);
        Block *currentBlock = _mm->resolve<Block>(blocks[blockIndex]);

        int index = cs->rowCount % (VALUES_SPACE / sizeof(T));

        T* p = (T*) &currentBlock->values[index * sizeof(T)];
        *p = value;
    }

private:
    MemoryMapW *_mm;

};

#endif // COLUMNW_H
