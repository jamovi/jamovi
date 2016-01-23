//
// Copyright (C) 2016 Jonathon Love
//

#include "column2.h"

#include "dataset2.h"

using namespace std;

Column2::Column2(DataSet2 *parent, MemoryMap *mm)
{
    _parent = parent;
    _mm = mm;
}

string Column2::name() const
{
    return string(this->c_str());
}

const char *Column2::c_str() const
{
    return _mm->resolve(struc()->name);
}

void Column2::setColumnType(Column2::ColumnType columnType)
{
    struc()->columnType = (char)columnType;
}

Column2::ColumnType Column2::columnType() const
{
    return (Column2::ColumnType) struc()->columnType;
}

ColumnStruct *Column2::struc() const
{
    return _mm->resolve(_rel);
}
    
void Column2::addLabel(int value, const char *label)
{
    ColumnStruct *s = struc();
    
    if (s->labelsUsed + 1 >= s->labelsCapacity)
        throw "max labels reached";
    
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

const char *Column2::getLabel(int value)
{
    ColumnStruct *s = struc();
    
    for (int i = 0; i < s->labelsUsed; i++)
    {
        Label &l = _mm->resolve(s->labels)[i];
        if (l.value == value)
            return _mm->resolve(l.label);
    }
    
    throw "label not found";
}
