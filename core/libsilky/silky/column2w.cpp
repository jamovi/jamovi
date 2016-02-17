//
// Copyright (C) 2016 Jonathon Love
//

#include "column2w.h"

#include <stdexcept>
#include <climits>

#include "dataset2.h"

using namespace std;

Column2W::Column2W(DataSet2W *parent, MemoryMapW *mm, ColumnStruct *rel)
    : Column2(parent, mm, rel)
{
    _mm = mm;
}

void Column2W::setColumnType(Column2::ColumnType columnType)
{
    struc()->columnType = (char)columnType;
}

void Column2W::addLabel(int value, const char *label)
{
    ColumnStruct *s = struc();
    
    if (s->labelsUsed + 1 >= s->labelsCapacity)
        throw runtime_error("max labels reached");
    
    int length = strlen(label)+1;
    size_t allocated;
    
    char *chars = _mm->allocate<char>(length, &allocated);
    
    std::memcpy(chars, label, length);
    
    s = struc();
    Label &l = _mm->resolve(s->labels)[s->labelsUsed];
    
    l.value = value;
    l.capacity = allocated;
    l.label = _mm->base(chars);
    
    s->labelsUsed++;
}