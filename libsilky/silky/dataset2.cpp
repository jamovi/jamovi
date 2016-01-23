//
// Copyright (C) 2016 Jonathon Love
//

#include "dataset2.h"

#include <cstring>
#include <climits>

using namespace std;

DataSet2 *DataSet2::create(MemoryMap *mm)
{
    DataSet2 *ds = new DataSet2(mm);
    DataSetStruct *rel = mm->allocateBase<DataSetStruct>();
    ds->_rel = rel;
    
    ColumnStruct *columns = mm->allocateBase<ColumnStruct>(1024);
    DataSetStruct *dss = mm->resolve(rel);
    
    dss->columns = columns;
    dss->capacity = 1024;
    dss->columnCount = 0;

    return ds;
}

DataSet2 *DataSet2::retrieve(MemoryMap *mm)
{
    DataSet2 *ds = new DataSet2(mm);

    ds->_rel = mm->base(mm->root<DataSetStruct>());
    
    return ds;
}

DataSet2::DataSet2(MemoryMap *mm)
    : _column(this, mm)
{
    _mm = mm;
}

DataSetStruct *DataSet2::struc() const
{
    return _mm->resolve(_rel);    
}

ColumnStruct *DataSet2::strucC(int index) const
{
    DataSetStruct *dss = struc();
    ColumnStruct *columns = _mm->resolve(dss->columns);
    ColumnStruct *column  = &columns[dss->columnCount];
    
    return column;
}

Column2 DataSet2::appendColumn(string name)
{
    int columnCount = struc()->columnCount;

    if (columnCount >= struc()->capacity)
        throw "Too many columns";
    
    char *chars = _mm->allocate<char>(name.size() + 1);  // +1 for null terminator
    memcpy(chars, name.c_str(), name.size() + 1);
    
    ColumnStruct *column;
    
    column = strucC(columnCount);
    column->name = _mm->base<char>(chars);
    
    column->rowCount = 0;
    
    column->blocksUsed = 0;
    column->blockCapacity = 1024;
    column->blocks = _mm->allocateBase<Block*>(column->blockCapacity);
    
    column = strucC(columnCount);
    
    column->labelsUsed = 0;
    column->labelsCapacity = 50;
    column->labels = _mm->allocateBase<Label>(50);
    
    struc()->columnCount++;
}

void DataSet2::appendRow()
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);

    for (int i = 0; i < dss->columnCount; i++)
    {
        _column._rel = _mm->base(&columns[i]);
        _column.append<int>(INT_MIN);
        
        dss     = _mm->resolve(_rel);
        columns = _mm->resolve(dss->columns);
    }
    
    dss->rowCount++;
}


Column2 DataSet2::operator[](string name)
{
    throw "not implemented yet";
}

Column2 DataSet2::operator[](int index)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);

    if (index >= dss->columnCount)
        throw "index out of bounds";
    
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);
    _column._rel = _mm->base<ColumnStruct>(&columns[index]);
    
    return _column;
}

int DataSet2::rowCount() const
{
    return _mm->resolve(_rel)->rowCount;
}

int DataSet2::columnCount() const
{
    return _mm->resolve(_rel)->columnCount;
}

