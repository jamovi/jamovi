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
    char *label;

} Label;

typedef struct
{
    char *name;
    char columnType;
    int rowCount;
    int capacity;

    int blocksUsed;
    int blockCapacity;
    Block **blocks;

    int labelsUsed;
    int labelsCapacity;
    Label *labels;

    int dps;

} ColumnStruct;

class Column
{
public:

    Column(DataSet *parent = 0, MemoryMap *mm = 0, ColumnStruct *rel = 0);

    std::string name() const;
    const char *c_str() const;
    const int rowCount() const;
    int dps() const;

    enum ColumnType { Misc = 0, NominalText = 1, Nominal = 2, Ordinal = 3, Continuous = 4 };

    ColumnType columnType() const;
    int labelCount() const;
    std::map<int, std::string> labels() const;
    const char *getLabel(int value);

    template<typename T> T& cell(int rowIndex)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);

        if (rowIndex >= cs->rowCount)
            throw "index out of bounds";

        int blockIndex = rowIndex * sizeof(T) / VALUES_SPACE;
        Block **blocks = _mm->resolve<Block*>(cs->blocks);
        Block *currentBlock = _mm->resolve<Block>(blocks[blockIndex]);

        int index = rowIndex % (VALUES_SPACE / sizeof(T));

        return *((T*) &currentBlock->values[index * sizeof(T)]);
    }

    int& intCell(int rowIndex)
    {
        return cell<int>(rowIndex);
    }

    double& doubleCell(int rowIndex)
    {
        return cell<double>(rowIndex);
    }

protected:

    ColumnStruct *struc() const;

    DataSet *_parent;
    ColumnStruct *_rel;

private:
    MemoryMap *_mm;

};

#endif // COLUMN_H
