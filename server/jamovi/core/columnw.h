//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMNW_H
#define COLUMNW_H

#include "datasetw.h"
#include "memorymapw.h"

#include <string>
#include <sstream>
#include <cmath>
#include <climits>

#include <cassert>

class DataSetW;

class ColumnW : public Column
{
    friend class DataSetW;
public:

    ColumnW(DataSetW *parent = 0, MemoryMapW *mm = 0, ColumnStruct *rel = 0);

    void setId(int id);
    void setName(const char *name);
    void setImportName(const char *name);
    void setDescription(const char *description);
    void setColumnType(ColumnType::Type columnType);
    void setDataType(DataType::Type dataType);
    void setMeasureType(MeasureType::Type measureType);
    void setAutoMeasure(bool yes);
    void appendLevel(int value, const char *label = 0, const char *importValue = 0);
    void insertLevel(int value, const char *label = 0, const char *importValue = 0);
    void removeLevel(int value);
    void clearLevels();
    void updateLevelCounts();
    void insertRows(int from, int to);
    void setDPs(int dps);
    void setFormula(const char *value);
    void setFormulaMessage(const char *value);
    void setActive(bool active);
    void setTrimLevels(bool trim);
    void trimUnusedLevels();
    void setDValue(int rowIndex, double value, bool initing = false);
    void setIValue(int rowIndex, int value, bool initing = false);
    void setSValue(int rowIndex, const char *value, bool initing = false);
    void changeDMType(DataType::Type dataType, MeasureType::Type measureType);
    void setLevels(const std::vector<LevelData> &levels);
    void setMissingValues(const std::vector<MissingValue> &missingValues);

    int changes() const;

    template<typename T> void setRowCount(size_t count)
    {
        _discardScratchColumn();
        _setRowCount<T>(count);
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
    static void _transferLevels(ColumnW &dest, ColumnW &src);
    void _discardScratchColumn();

    template<typename T> void _setRowCount(size_t count)
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

        if (dataType() == DataType::DECIMAL)
        {
            for (size_t i = oldCount; i < count; i++)
                cellAt<double>(i) = NAN;
        }
        else if (dataType() == DataType::TEXT &&
                 measureType() == MeasureType::ID)
        {
            for (size_t i = oldCount; i < count; i++)
                cellAt<char*>(i) = NULL;
        }
        else
        {
            for (size_t i = oldCount; i < count; i++)
                cellAt<int>(i) = INT_MIN;
        }
    }

};

#endif // COLUMNW_H
