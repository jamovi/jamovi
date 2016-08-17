//
// Copyright (C) 2016 Jonathon Love
//

#ifndef DATASETW_H
#define DATASETW_H

#include <string>

#include "dataset.h"
#include "memorymapw.h"
#include "columnw.h"

class ColumnW;

class DataSetW : public DataSet
{
public:

    static DataSetW *create(MemoryMapW *mm);
    static DataSetW *retrieve(MemoryMapW *mm);

    void appendColumn(std::string name);
    void appendRow();

    ColumnW operator[](int index);
    ColumnW operator[](std::string name);

protected:

    DataSetW(MemoryMapW *memoryMap);

private:

    MemoryMapW *_mm;
};

#endif // DATASETW_H
