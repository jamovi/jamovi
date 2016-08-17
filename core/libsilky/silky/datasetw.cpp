//
// Copyright (C) 2016 Jonathon Love
//

#include "datasetw.h"

#include <cstring>
#include <climits>
#include <stdexcept>

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

ColumnW DataSetW::operator[](string name)
{
    throw runtime_error("not implemented yet");
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

void DataSetW::appendColumn(string name)
{
    int columnCount = struc()->columnCount;

    if (columnCount >= struc()->capacity)
        throw runtime_error("Too many columns");

    char *chars = _mm->allocate<char>(name.size() + 1);  // +1 for null terminator
    memcpy(chars, name.c_str(), name.size() + 1);

    ColumnStruct *column;

    column = strucC(columnCount);
    column->name = _mm->base<char>(chars);

    column->rowCount = 0;

    column->blocksUsed = 0;
    column->blockCapacity = 1024;

    Block** blocks = _mm->allocateBase<Block*>(column->blockCapacity);
    column = strucC(columnCount);
    column->blocks = blocks;

    column->labelsUsed = 0;
    column->labelsCapacity = 50;
    column->labels = _mm->allocateBase<Label>(50);

    struc()->columnCount++;
}

void DataSetW::appendRow()
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);

    for (int i = 0; i < dss->columnCount; i++)
    {
        ColumnStruct *c = _mm->base(&columns[i]);
        ColumnW column(this, _mm, c);
        column.append<int>(INT_MIN);

        dss     = _mm->resolve(_rel);
        columns = _mm->resolve(dss->columns);
    }

    dss->rowCount++;
}
