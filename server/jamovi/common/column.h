//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMN_H
#define COLUMN_H

#include "memorymap.h"
#include "vartypes.h"
#include "level.h"

#include <string>
#include <vector>
#include <utility>
#include <cmath>

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
    int countExFiltered;
    char *label;
    char *importValue;
    bool treatAsMissing;

} Level;

typedef union {
    int i;
    double d;
    char *s;
} Value;

typedef struct
{
    int type;
    int optr;
    Value value;

} MissingValue;

typedef struct
{
    int id;
    char *name;
    char *importName;
    char columnType;
    char dataType;
    char measureType;
    char autoMeasure;
    bool active;
    int rowCount;
    int capacity;

    int blocksUsed;
    int blockCapacity;
    Block **blocks;

    int levelsUsed;
    int levelsCapacity;
    Level *levels;

    MissingValue *missingValues;
    int missingValuesCapacity;
    int missingValuesUsed;

    char *formula;
    int formulaCapacity;
    char *formulaMessage;
    int formulaMessageCapacity;

    char dps;
    int trimLevels;

    char changes;

} ColumnStruct;

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
    int rowCountExFiltered() const;
    int dps() const;
    bool active() const;

    ColumnType::Type columnType() const;
    MeasureType::Type measureType() const;
    DataType::Type dataType() const;
    bool autoMeasure() const;
    int levelCount() const;
    int levelCountExFilteredExMissing() const;
    const std::vector<LevelData> levels() const;
    const std::vector<MissingValue> missingValues() const;
    const char *getLabel(int value) const;
    const char *getLabel(const char* value) const;
    const char *getImportValue(int value) const;
    int valueForLabel(const char *label) const;
    bool hasLevels() const;
    bool hasLevel(const char *label) const;
    bool hasLevel(int value) const;
    const char *formula() const;
    const char *formulaMessage() const;
    bool trimLevels() const;
    bool hasUnusedLevels() const;
    bool shouldTreatAsMissing(int rowIndex);
    bool shouldTreatAsMissing(const char *sv, const char *sv2);
    bool shouldTreatAsMissing(const char *svalue, int ivalue = INT_MIN, double dvalue = NAN, const char *sv2 = NULL);

    const char *raws(int rowIndex);

    template<typename T> T raw(int rowIndex)
    {
        return cellAt<T>(rowIndex);
    }

protected:

    ColumnStruct *struc() const;

    DataSet *_parent;
    ColumnStruct *_rel;

    Level *rawLevel(int value) const;
    int getIndexExFiltered(int index);

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

    int ivalue(int index);
    const char *svalue(int index);
    double dvalue(int index);

private:
    MemoryMap *_mm;

};

#endif // COLUMN_H
