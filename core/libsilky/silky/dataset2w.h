//
// Copyright (C) 2016 Jonathon Love
//

#ifndef DATASET2W_H
#define DATASET2W_H

#include <string>

#include "dataset2.h"
#include "memorymapw.h"
#include "column2w.h"

class Column2W;

class DataSet2W : public DataSet2
{   
public:

    static DataSet2W *create(MemoryMapW *mm);
    static DataSet2W *retrieve(MemoryMapW *mm);
    
    void appendColumn(std::string name);
    void appendRow();

    Column2W operator[](int index);
    Column2W operator[](std::string name);

protected:

    DataSet2W(MemoryMapW *memoryMap);

private:

    MemoryMapW *_mm;
};

#endif // DATASET2W_H
