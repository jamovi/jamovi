//
// Copyright (C) 2016 Jonathon Love
//

#ifndef DATASET_H
#define DATASET_H

#include <string>

#include "memorymap.h"
#include "column.h"

typedef struct
{
    int columnCount; // columns used
    int rowCount;
    ColumnStruct **columns;
    int capacity;  // size of columns array
    int nextColumnId;

} DataSetStruct;

class DataSet
{
public:

    static DataSet *retrieve(MemoryMap *mm);

    int rowCount() const;
    int columnCount() const;

    bool isRowFiltered(int index) const;
    int rowCountExFiltered() const;

    Column operator[](int index);
    Column operator[](const char *name);
    Column getColumnById(int id);

protected:

    DataSet(MemoryMap *memoryMap);
    DataSetStruct *struc() const;
    ColumnStruct *strucC(int index) const;

    DataSetStruct *_rel;

private:

    MemoryMap *_mm;

};

#endif // DATASET_H
