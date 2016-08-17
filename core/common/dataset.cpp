//
// Copyright (C) 2016 Jonathon Love
//

#include "dataset.h"

#include <cstring>
#include <climits>
#include <stdexcept>

using namespace std;

DataSet *DataSet::retrieve(MemoryMap *mm)
{
    DataSet *ds = new DataSet(mm);

    ds->_rel = mm->base(mm->root<DataSetStruct>());

    return ds;
}

DataSet::DataSet(MemoryMap *mm)
{
    _mm = mm;
}

DataSetStruct *DataSet::struc() const
{
    return _mm->resolve(_rel);
}

ColumnStruct *DataSet::strucC(int index) const
{
    DataSetStruct *dss = struc();
    ColumnStruct *columns = _mm->resolve(dss->columns);
    ColumnStruct *column  = &columns[dss->columnCount];

    return column;
}

Column DataSet::operator[](string name)
{
    throw runtime_error("not implemented yet");
}

Column DataSet::operator[](int index)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);

    if (index >= dss->columnCount)
        throw runtime_error("index out of bounds");

    ColumnStruct *columns = _mm->resolve<ColumnStruct>(dss->columns);
    ColumnStruct *rel = _mm->base<ColumnStruct>(&columns[index]);

    return Column(this, _mm, rel);
}

int DataSet::rowCount() const
{
    return _mm->resolve(_rel)->rowCount;
}

int DataSet::columnCount() const
{
    return _mm->resolve(_rel)->columnCount;
}
