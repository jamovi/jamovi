//
// Copyright (C) 2016 Jonathon Love
//

#include "dataset2.h"

#include <cstring>
#include <climits>
#include <stdexcept>

using namespace std;

DataSet2 *DataSet2::retrieve(MemoryMap *mm)
{
    DataSet2 *ds = new DataSet2(mm);

    ds->_rel = mm->base(mm->root<DataSetStruct>());
    
    return ds;
}

DataSet2::DataSet2(MemoryMap *mm)
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

Column2 DataSet2::operator[](string name)
{
    throw runtime_error("not implemented yet");
}

Column2 DataSet2::operator[](int index)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);

    if (index >= dss->columnCount)
        throw runtime_error("index out of bounds");
    
    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);
    ColumnStruct *rel = _mm->base<ColumnStruct>(&columns[index]);
    
    return Column2(this, _mm, rel);
}

int DataSet2::rowCount() const
{
    return _mm->resolve(_rel)->rowCount;
}

int DataSet2::columnCount() const
{
    return _mm->resolve(_rel)->columnCount;
}

