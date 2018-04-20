//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMN_H
#define COLUMN_H

#include "memorymap.h"

#include <string>
#include <vector>
#include <utility>

#ifdef _WIN32
#define ALIGN_8 alignas(8)
#else
#define ALIGN_8 __attribute__ ((aligned (8)))
#endif

class DataSet;

typedef struct
{
    int start;
    int length;
    int capacity;

    char values[8] ALIGN_8;

} Block;


#define BLOCK_SIZE 32768
#define VALUES_SPACE (BLOCK_SIZE - sizeof(Block) + 8)

typedef struct
{
    int value;
    int capacity;
    int importCapacity;
    int count;
    char *label;
    char *importValue;

} Level;

typedef struct
{
    int id;
    char *name;
    char *importName;
    char columnType;
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

    char *formula;
    int formulaCapacity;
    char *formulaMessage;
    int formulaMessageCapacity;

    char dps;

    char changes;

} ColumnStruct;

typedef struct LevelData
{
    int value;
    std::string label;
    std::string importValue;

} LevelData;

namespace MeasureType
{
    enum Type
    {
        NONE = 0,
        NOMINAL_TEXT = 1,
        NOMINAL = 2,
        ORDINAL = 3,
        CONTINUOUS = 4
    };
}

namespace ColumnType
{
    enum Type
    {
        NONE = 0,
        DATA = 1,
        COMPUTED = 2,
        RECODED = 3,
        FILTER = 4
    };
}

class Column
{
public:

    Column(DataSet *parent = 0, MemoryMap *mm = 0, ColumnStruct *rel = 0);

    int id() const;
    const char *name() const;
    const char *importName() const;
    int rowCount() const;
    int dps() const;

    ColumnType::Type columnType() const;
    MeasureType::Type measureType() const;
    bool autoMeasure() const;
    int levelCount() const;
    const std::vector<LevelData> levels() const;
    const char *getLabel(int value) const;
    const char *getImportValue(int value) const;
    int valueForLabel(const char *label) const;
    bool hasLevel(const char *label) const;
    bool hasLevel(int value) const;
    const char *formula() const;
    const char *formulaMessage() const;

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
