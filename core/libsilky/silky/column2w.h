//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMN2W_H
#define COLUMN2W_H

#include "dataset2w.h"
#include "memorymapw.h"

#include <string>

class DataSet2W;

class Column2W : public Column2
{   
public:

    Column2W(DataSet2W *parent = 0, MemoryMapW *mm = 0, ColumnStruct *rel = 0);
    
    void setColumnType(ColumnType columnType);    
    void addLabel(int value, const char *label);
    
    template<typename T> void append(const T &value)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);
    
        int blockIndex = cs->rowCount * sizeof(T) / VALUES_SPACE;
        Block** blocks;
        Block* currentBlock;
        
        if (blockIndex >= cs->blocksUsed)
        {
            currentBlock = _mm->allocateSize<Block>(BLOCK_SIZE);
            cs = _mm->resolve<ColumnStruct>(_rel);
            blocks = _mm->resolve<Block*>(cs->blocks);
            blocks[blockIndex] = _mm->base(currentBlock);
            cs->blocksUsed++;
        }
        else
        {
            blocks = _mm->resolve<Block*>(cs->blocks);
            currentBlock = _mm->resolve<Block>(blocks[blockIndex]);
        }
        
        int index = cs->rowCount % (VALUES_SPACE / sizeof(T));
        
        T* p = (T*) &currentBlock->values[index * sizeof(T)];
        *p = value;
        
        cs->rowCount++;
    }
    
private:
    MemoryMapW *_mm;
    
};

#endif // COLUMN2W_H
