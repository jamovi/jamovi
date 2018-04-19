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
    ColumnStruct **columns = _mm->resolve(dss->columns);
    ColumnStruct *column  = _mm->resolve(columns[index]);

    return column;
}

Column DataSet::getColumnById(int id)
{
    for (int i = 0; i < columnCount(); i++)
    {
        Column column = (*this)[i];
        if (column.id() == id)
            return column;
    }

    throw runtime_error("no such column");
}

Column DataSet::operator[](const char *name)
{
    for (int i = 0; i < columnCount(); i++)
    {
        Column column = (*this)[i];
        if (strcmp(column.name(), name) == 0)
            return column;
    }

    throw runtime_error("no such column");
}

Column DataSet::operator[](int index)
{
    DataSetStruct *dss = _mm->resolve<DataSetStruct>(_rel);

    if (index >= dss->columnCount)
        throw runtime_error("index out of bounds");

    ColumnStruct **columns = _mm->resolve<ColumnStruct*>(dss->columns);
    ColumnStruct *rel = columns[index];

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

bool DataSet::isRowFiltered(int index) const
{
    DataSet ds = *this;

    for (int colNo = 0; colNo < columnCount(); colNo++)
    {
        Column column = ds[colNo];

        if (column.columnType() == ColumnType::FILTER)
        {
            if ( ! column.active())
                continue;

            int value = column.value<int>(index);
            if (value != 1)
                return true;
        }
        else
        {
            return false;
        }
    }

    return false;
}

int DataSet::rowCountExFiltered() const
{
    int nRows = 0;

    for (int rowNo = 0; rowNo < rowCount(); rowNo++)
    {
        if ( ! isRowFiltered(rowNo))
            nRows++;
    }

    return nRows;
}
