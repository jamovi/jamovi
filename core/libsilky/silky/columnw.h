//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMNW_H
#define COLUMNW_H

#include "datasetw.h"
#include "memorymapw.h"

#include <string>

class DataSetW;

class ColumnW : public Column
{
public:

    ColumnW(DataSetW *parent = 0, MemoryMapW *mm = 0, ColumnStruct *rel = 0);

    void setMeasureType(MeasureType::Type measureType);
    void appendLevel(int value, const char *label);
    void insertLevel(int value, const char *label);
    void clearLevels();
    void setDPs(int dps);

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

        cs->rowCount = count;
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
