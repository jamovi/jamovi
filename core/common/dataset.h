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
    int columnCount;
    int rowCount;
    ColumnStruct *columns;
    int capacity;

} DataSetStruct;

class DataSet
{
public:

    static DataSet *retrieve(MemoryMap *mm);

    int rowCount() const;
    int columnCount() const;

    Column operator[](int index);
    Column operator[](std::string name);

protected:

    DataSet(MemoryMap *memoryMap);
    DataSetStruct *struc() const;
    ColumnStruct *strucC(int index) const;

    DataSetStruct *_rel;

private:

    MemoryMap *_mm;

};

#endif // DATASET_H
