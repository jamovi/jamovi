//
// Copyright (C) 2016 Jonathon Love
//

#ifndef DATASET2_H
#define DATASET2_H

#include <string>

#include "memorymap.h"
#include "column2.h"

typedef struct
{
    int columnCount;
    int rowCount;
    ColumnStruct *columns;
    int capacity;
    
} DataSetStruct;

class DataSet2
{
public:

    static DataSet2 *retrieve(MemoryMap *mm);

    int rowCount() const;
    int columnCount() const;

    Column2 operator[](int index);
    Column2 operator[](std::string name);

protected:

    DataSet2(MemoryMap *memoryMap);
    DataSetStruct *struc() const;
    ColumnStruct *strucC(int index) const;
    
    DataSetStruct *_rel;

private:

    MemoryMap *_mm;

};

#endif // DATASET2_H
