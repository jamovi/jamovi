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
    friend class Column2;
    
public:

    static DataSet2 *create(MemoryMap *mm);
    static DataSet2 *retrieve(MemoryMap *mm);

	int rowCount() const;
	int columnCount() const;
	
	void appendColumn(std::string name);
	void appendRow();

	Column2 operator[](int index);
	Column2 operator[](std::string name);

private:

	DataSet2(MemoryMap *memoryMap);
    inline DataSetStruct *struc() const;
    ColumnStruct *strucC(int index) const;

    MemoryMap *_mm;
    DataSetStruct *_rel;
    Column2 _column;
};

#endif // DATASET2_H
