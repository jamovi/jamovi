//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMN_H
#define COLUMN_H

#include "memorymap.h"

#include <string>
#include <map>

class DataSet;

typedef struct
{
    int start;
    int length;
    int capacity;

    char values[8];

} Block;

#define BLOCK_SIZE 32768
#define VALUES_SPACE (BLOCK_SIZE - sizeof(Block) + 8)

typedef struct
{
    int value;
    int capacity;
    int count;
    char *label;

} Level;

typedef struct
{
    char *name;
    char measureType;
    char autoMeasure;
    int rowCount;
    int capacity;

    int blocksUsed;
    int blockCapacity;
    Block **blocks;

    int levelsUsed;
    int levelsCapacity;
    Level *levels;

    char dps;

    char changes;

} ColumnStruct;

namespace MeasureType
{
    enum Type
    {
        MISC = 0,
        NOMINAL_TEXT = 1,
        NOMINAL = 2,
        ORDINAL = 3,
        CONTINUOUS = 4
    };
}

class Column
{
public:

    Column(DataSet *parent = 0, MemoryMap *mm = 0, ColumnStruct *rel = 0);

    const char *name() const;
    int rowCount() const;
    int dps() const;

    MeasureType::Type measureType() const;
    bool autoMeasure() const;
    int levelCount() const;
    std::map<int, std::string> levels() const;
    const char *getLabel(int value) const;
    int valueForLabel(const char *label) const;
    bool hasLevel(const char *label) const;
    bool hasLevel(int value) const;

    template<typename T> T value(int rowIndex)
    {
        return cellAt<T>(rowIndex);
    }

protected:

    ColumnStruct *struc() const;

    DataSet *_parent;
    ColumnStruct *_rel;

    Level *rawLevel(int value) const;

    template<typename T> T& cellAt(int rowIndex)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);

        if (rowIndex >= cs->rowCount)
            throw std::runtime_error("index out of bounds");

        int blockIndex = rowIndex * sizeof(T) / VALUES_SPACE;
        Block **blocks = _mm->resolve<Block*>(cs->blocks);
        Block *currentBlock = _mm->resolve<Block>(blocks[blockIndex]);

        int index = rowIndex % (VALUES_SPACE / sizeof(T));

        return *((T*) &currentBlock->values[index * sizeof(T)]);
    }

private:
    MemoryMap *_mm;

};

#endif // COLUMN_H
