//
// Copyright (C) 2016 Jonathon Love
//

#include "datasetw.h"

#include <cstring>
#include <climits>
#include <stdexcept>
#include <cmath>

using namespace std;

DataSetW *DataSetW::create(MemoryMapW *mm)
{
    DataSetW *ds = new DataSetW(mm);
    DataSetStruct *rel = mm->allocateBase<DataSetStruct>();
    ds->_rel = rel;

    ColumnStruct *columns = mm->allocateBase<ColumnStruct>(1024);
    DataSetStruct *dss = mm->resolve(rel);

    dss->columns = columns;
    dss->capacity = 1024;
    dss->columnCount = 0;

    return ds;
}

DataSetW *DataSetW::retrieve(MemoryMapW *mm)
{
    DataSetW *ds = new DataSetW(mm);

    ds->_rel = mm->base(mm->root<DataSetStruct>());

    return ds;
}

DataSetW::DataSetW(MemoryMapW *mm)
    : DataSet(mm)
{
    _mm = mm;
}

ColumnW DataSetW::operator[](const char *name)
{
    for (int i = 0; i < columnCount(); i++)
    {
        ColumnW column = (*this)[i];
        if (strcmp(column.name(), name) == 0)
            return column;
    }

    throw runtime_error("no such column");
}

ColumnW DataSetW::operator[](int index)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);

    if (index >= dss->columnCount)
        throw runtime_error("index out of bounds");

    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);
    ColumnStruct *rel = _mm->base<ColumnStruct>(&columns[index]);

    return ColumnW(this, _mm, rel);
}

ColumnW DataSetW::appendColumn(const char *name)
{
    int columnCount = struc()->columnCount;

    if (columnCount >= struc()->capacity)
        throw runtime_error("Too many columns");

    int n = strlen(name);
    char *chars = _mm->allocate<char>(n + 1);  // +1 for null terminator
    memcpy(chars, name, n + 1);

    ColumnStruct *column;

    column = strucC(columnCount);
    column->name = _mm->base<char>(chars);

    column->measureType = MeasureType::NOMINAL;
    column->autoMeasure = false;
    column->rowCount = 0;

    column->blocksUsed = 0;
    column->blockCapacity = 1024;

    Block** blocks = _mm->allocateBase<Block*>(column->blockCapacity);
    column = strucC(columnCount);
    column->blocks = blocks;

    column->levelsUsed = 0;
    column->levelsCapacity = 0;

    column->dps = 0;
    column->changes = 0;

    struc()->columnCount++;

    return ColumnW(this, _mm, _mm->base<ColumnStruct>(column));
}

void DataSetW::setRowCount(size_t count)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);

    for (int i = 0; i < dss->columnCount; i++)
    {
        ColumnStruct *c = _mm->base(&columns[i]);
        ColumnW column(this, _mm, c);

        if (column.measureType() == MeasureType::CONTINUOUS)
            column.setRowCount<double>(count);
        else
            column.setRowCount<int>(count);

        dss     = _mm->resolve(_rel);
        columns = _mm->resolve(dss->columns);
    }

    dss->rowCount = count;
}

void DataSetW::appendRow()
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);

    for (int i = 0; i < dss->columnCount; i++)
    {
        ColumnStruct *c = _mm->base(&columns[i]);
        ColumnW column(this, _mm, c);

        if (column.measureType() == MeasureType::CONTINUOUS)
            column.append<double>(NAN);
        else
            column.append<int>(INT_MIN);

        dss     = _mm->resolve(_rel);
        columns = _mm->resolve(dss->columns);
    }

    dss->rowCount++;
}
