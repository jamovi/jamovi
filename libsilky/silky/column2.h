//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COLUMN2_H
#define COLUMN2_H

#include "memorymap.h"

#include <string>

class DataSet2;

typedef struct
{
    int start;
    int length;
    int capacity;
    char values[8];
    
} Block;

#define BLOCK_SIZE 32768
#define VALUES_SPACE (BLOCK_SIZE - sizeof(Block) + 8)

typedef struct
{
    int value;
    int capacity;
    char *label;
    
} Label;

typedef struct
{
    char *name;
    char columnType;
    int rowCount;
    int capacity;
    
    int blocksUsed;
    int blockCapacity;
    Block **blocks;
    
    int labelsUsed;
    int labelsCapacity;
    Label *labels;
    
} ColumnStruct;

class Column2
{
    friend class DataSet2;
public:

    Column2(DataSet2 *parent = 0, MemoryMap *mm = 0);
    
    std::string name() const;
    const char *c_str() const;
    const int rowCount() const;

    enum ColumnType { Misc = 0, NominalText = 1, Nominal = 2, Ordinal = 3, Continuous = 4 };
    
    void setColumnType(ColumnType columnType);
    ColumnType columnType() const;
    
    void addLabel(int value, const char *label);
    const char *getLabel(int value);
    
    template<typename T> T& cell(int rowIndex)
    {
        ColumnStruct *cs = _mm->resolve<ColumnStruct>(_rel);
        
        if (rowIndex >= cs->rowCount)
            throw "index out of bounds";
    
        int blockIndex = rowIndex * sizeof(T) / VALUES_SPACE;
        Block **blocks = _mm->resolve<Block*>(cs->blocks);
        Block *currentBlock = _mm->resolve<Block>(blocks[blockIndex]);
        
        int index = rowIndex % (VALUES_SPACE / sizeof(T));
        
        return *((T*) &currentBlock->values[index * sizeof(T)]);
    }
    
    int& intCell(int rowIndex)
    {
        return cell<int>(rowIndex);
    }
    
    double& doubleCell(int rowIndex)
    {
        return cell<double>(rowIndex);
    }
    
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
    
    inline ColumnStruct *struc() const;

    DataSet2 *_parent;
    MemoryMap *_mm;
    ColumnStruct *_rel;
};

#endif // COLUMN2_H
