//
// Copyright (C) 2016 Jonathon Love
//

#include "columnw.h"

#include <stdexcept>
#include <climits>
#include <map>
#include <set>
#include <iomanip>
#include <cmath>

#include "dataset.h"

using namespace std;

ColumnW::ColumnW(DataSetW *parent, MemoryMapW *mm, ColumnStruct *rel)
    : Column(parent, mm, rel)
{
    _mm = mm;
}

void ColumnW::setId(int id)
{
    struc()->id = id;
}

void ColumnW::setName(const char *name)
{
    int length = strlen(name)+1;

    char *chars = _mm->allocate<char>(length);

    memcpy(chars, name, length);

    ColumnStruct *s = struc();
    s->name = _mm->base(chars);
    s->changes++;
}

void ColumnW::setImportName(const char *name)
{
    int length = strlen(name)+1;

    char *chars = _mm->allocate<char>(length);

    memcpy(chars, name, length);

    ColumnStruct *s = struc();
    s->importName = _mm->base(chars);
    s->changes++;
}

void ColumnW::setColumnType(ColumnType::Type columnType)
{
    ColumnStruct *s = struc();
    s->columnType = (char)columnType;
    s->changes++;
}

void ColumnW::setDataType(DataType::Type dataType)
{
    ColumnStruct *s = struc();
    s->dataType = (char)dataType;
    s->changes++;

    if (dataType == DataType::DECIMAL)
        _setRowCount<double>(rowCount()); // keeps the row count the same, but allocates space
    else if (dataType == DataType::TEXT && measureType() == MeasureType::ID)
        _setRowCount<char*>(rowCount()); // keeps the row count the same, but allocates space
}

void ColumnW::setMeasureType(MeasureType::Type measureType)
{
    ColumnStruct *s = struc();
    s->measureType = (char)measureType;
    s->changes++;

    if (dataType() == DataType::TEXT && measureType == MeasureType::ID)
        _setRowCount<char*>(rowCount()); // keeps the row count the same, but allocates space
}

void ColumnW::setAutoMeasure(bool yes)
{
    ColumnStruct *s = struc();
    s->autoMeasure = yes;
    s->changes++;
}

void ColumnW::setDPs(int dps)
{
    ColumnStruct *s = struc();
    s->dps = dps;
    s->changes++;
}

void ColumnW::setActive(bool active)
{
    ColumnStruct *s = struc();
    s->active = active;
    s->changes++;
}

void ColumnW::setTrimLevels(bool trim)
{
    ColumnStruct *s = struc();
    if (s->trimLevels == trim)
        return;

    if (trim)
        trimUnusedLevels();

    s->trimLevels = trim;
    s->changes++;
}

void ColumnW::trimUnusedLevels()
{
    ColumnStruct *s = struc();

    Level *levels = _mm->resolve(s->levels);
    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        if (level.count == 0)
        {
            removeLevel(level.value);
            i--;
        }
    }
}

void ColumnW::setFormula(const char *value)
{
    ColumnStruct *s = struc();
    int capacity = s->formulaCapacity;
    int needed = strlen(value) + 1;
    if (needed > capacity)
    {
        size_t allocated;
        char *space = _mm->allocateSize<char>(needed, &allocated);
        memcpy(space, value, needed);
        s = struc();
        s->formula = _mm->base<char>(space);
        s->formulaCapacity = allocated;
    }
    else
    {
        char *space = _mm->resolve<char>(s->formula);
        memcpy(space, value, needed);
    }

    s->changes++;
}

void ColumnW::setFormulaMessage(const char *value)
{
    ColumnStruct *s = struc();
    int capacity = s->formulaMessageCapacity;
    int needed = strlen(value) + 1;
    if (needed > capacity)
    {
        size_t allocated;
        char *space = _mm->allocateSize<char>(needed, &allocated);
        memcpy(space, value, needed);
        s = struc();
        s->formulaMessage = _mm->base<char>(space);
        s->formulaMessageCapacity = allocated;
    }
    else
    {
        char *space = _mm->resolve<char>(s->formulaMessage);
        memcpy(space, value, needed);
    }

    s->changes++;
}

void ColumnW::setDValue(int rowIndex, double value, bool initing)
{
    if ( ! initing)
        _discardScratchColumn();

    cellAt<double>(rowIndex) = value;
}

void ColumnW::setSValue(int rowIndex, const char *value, bool initing)
{
    if ( ! initing)
        _discardScratchColumn();

    assert(dataType() == DataType::TEXT);
    assert(measureType() == MeasureType::ID);

    if (value == NULL || value[0] == '\0')
    {
        cellAt<char*>(rowIndex) = NULL;
    }
    else
    {
        size_t n = strlen(value);
        char *c = _mm->allocate<char>(n + 1);
        memcpy(c, value, n + 1);
        cellAt<char*>(rowIndex) = _mm->base(c);
    }
}

void ColumnW::setIValue(int rowIndex, int value, bool initing)
{
    if ( ! initing)
        _discardScratchColumn();

    if (hasLevels())
    {
        int newValue = (int)value;

        if (initing == false)
        {
            int oldValue = this->raw<int>(rowIndex);

            if (oldValue == newValue)
                return;

            if (oldValue != INT_MIN)
            {
                Level *level = rawLevel(oldValue);
                assert(level != NULL);
                level->count--;

                if (level->count == 0 && trimLevels())
                    removeLevel(oldValue);
                else if ( ! this->_parent->isRowFiltered(rowIndex))
                    level->countExFiltered--;
            }
        }

        if (newValue != INT_MIN)
        {
            Level *level = rawLevel(newValue);
            if (level == NULL)
            {
                ostringstream ss;
                ss << newValue;
                string str = ss.str();
                const char *c_str = str.c_str();
                insertLevel(newValue, c_str, c_str);
                level = rawLevel(newValue);
            }
            assert(level != NULL);
            level->count++;
            if ( ! this->_parent->isRowFiltered(rowIndex))
                level->countExFiltered++;
        }
    }

    cellAt<int>(rowIndex) = value;
}

void ColumnW::insertRows(int insStart, int insEnd)
{
    int insCount = insEnd - insStart + 1;
    int startCount = rowCount();
    int finalCount = startCount + insCount;

    if (dataType() == DataType::DECIMAL)
    {
        setRowCount<double>(finalCount);

        for (int j = finalCount - 1; j > insEnd; j--)
            cellAt<double>(j) = cellAt<double>(j - insCount);

        for (int j = insStart; j <= insEnd; j++)
            cellAt<double>(j) = NAN;
    }
    else if (dataType() == DataType::TEXT && measureType() == MeasureType::ID)
    {
        setRowCount<char*>(finalCount);

        for (int j = finalCount - 1; j > insEnd; j--)
            cellAt<char*>(j) = cellAt<char*>(j - insCount);

        for (int j = insStart; j <= insEnd; j++)
            cellAt<char*>(j) = NULL;
    }
    else
    {
        setRowCount<int>(finalCount);

        for (int j = finalCount - 1; j > insEnd; j--)
            cellAt<int>(j) = cellAt<int>(j - insCount);

        for (int j = insStart; j <= insEnd; j++)
            cellAt<int>(j) = INT_MIN;
    }
}

void ColumnW::appendLevel(int value, const char *label, const char *importValue)
{
    ColumnStruct *s = struc();

    string tmp;
    if (label == NULL)
    {
        stringstream ss;
        ss << value;
        tmp = ss.str();
        label = tmp.c_str();
    }

    if (importValue == NULL)
        importValue = label;

    if (s->levelsUsed + 1 >= s->levelsCapacity)
    {
        int oldCapacity = s->levelsCapacity;
        int newCapacity = (oldCapacity == 0) ? 50 : 2 * oldCapacity;

        Level *newLevels = _mm->allocate<Level>(newCapacity);
        s = struc();

        if (oldCapacity > 0)
        {
            Level *oldLevels = _mm->resolve(s->levels);

            for (int i = 0; i < s->levelsUsed; i++)
            {
                Level &oldLevel = oldLevels[i];
                Level &newLevel = newLevels[i];
                newLevel = oldLevel;
            }
        }

        s->levels = _mm->base(newLevels);
        s->levelsCapacity = newCapacity;
    }

    int length = strlen(label)+1;
    size_t allocated;
    char *chars = _mm->allocate<char>(length, &allocated);
    memcpy(chars, label, length);
    chars = _mm->base(chars);

    if (importValue == NULL)
        importValue = label;
    length = strlen(importValue)+1;
    size_t importAllocated;
    char *importChars = _mm->allocate<char>(length, &importAllocated);
    memcpy(importChars, importValue, length);
    importChars = _mm->base(importChars);

    s = struc();
    Level &l = _mm->resolve(s->levels)[s->levelsUsed];

    l.value = value;
    l.capacity = allocated;
    l.label = chars;
    l.importCapacity = importAllocated;
    l.importValue = importChars;
    l.count = 0;
    l.countExFiltered = 0;

    s->levelsUsed++;
    s->changes++;
}

void ColumnW::updateLevelCounts() {

    if (hasLevels())
    {
        ColumnStruct *s = struc();
        Level *levels = _mm->resolve(s->levels);
        int levelCount = s->levelsUsed;

        for (int i = 0; i < levelCount; i++)
        {
            Level &level = levels[i];
            level.count = 0;
            level.countExFiltered = 0;
        }

        for (int i = 0; i < rowCount(); i++)
        {
            int &v = this->cellAt<int>(i);
            if (v == INT_MIN)
                continue;
            Level *level = rawLevel(v);
            assert(level != NULL);
            level->count++;
            if ( ! this->_parent->isRowFiltered(i))
                level->countExFiltered++;
        }
    }
}

void ColumnW::insertLevel(int value, const char *label, const char *importValue)
{
    appendLevel(value, label, importValue); // add to end

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);
    int lastIndex = s->levelsUsed - 1;
    char *baseLabel = levels[lastIndex].label;
    char *baseImportValue = levels[lastIndex].importValue;

    bool ascending = true;
    bool descending = true;
    for (int i = 0; i < lastIndex - 1; i++) {
        Level &level = levels[i];
        Level &nextLevel = levels[i+1];
        if (ascending && level.value > nextLevel.value)
            ascending = false;
        if (descending && level.value < nextLevel.value)
            descending = false;
    }

    if (ascending && descending)
        descending = false;

    if (ascending == false && descending == false)
    {
        // if the levels are neither ascending nor descending
        // then just add the level to the end

        Level &level = levels[lastIndex];
        level.value = value;
        level.label = baseLabel;
        level.importValue = baseImportValue;
        level.count = 0;
        level.countExFiltered = 0;
    }
    else
    {
        bool inserted = false;

        for (int i = lastIndex - 1; i >= 0; i--)
        {
            Level &level = levels[i];
            Level &nextLevel = levels[i+1];

            assert(level.value != value);

            if (ascending && level.value > value)
            {
                nextLevel = level;
            }
            else if (descending && level.value < value)
            {
                nextLevel = level;
            }
            else
            {
                nextLevel.value = value;
                nextLevel.label = baseLabel;
                nextLevel.importValue = baseImportValue;
                nextLevel.count = 0;
                nextLevel.countExFiltered = 0;
                inserted = true;
                break;
            }
        }

        if ( ! inserted)
        {
            Level &level = levels[0];
            level.value = value;
            level.label = baseLabel;
            level.importValue = baseImportValue;
            level.count = 0;
            level.countExFiltered = 0;
        }
    }

    s->changes++;
}

void ColumnW::removeLevel(int value)
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    int i = 0;

    for (; i < s->levelsUsed; i++)
    {
        if (levels[i].value == value)
            break;
    }

    assert(i != s->levelsUsed); // level not found

    int index = i;

    for (; i < s->levelsUsed - 1; i++)
        levels[i] = levels[i+1];

    s->levelsUsed--;

    if (dataType() == DataType::TEXT)
    {
        // consolidate levels

        for (int i = index; i < s->levelsUsed; i++)
            levels[i].value--;

        for (int i = 0; i < rowCount(); i++) {
            int &v = this->cellAt<int>(i);
            if (v > value)
                v--;
        }
    }

    s->changes++;
}

void ColumnW::clearLevels()
{
    ColumnStruct *s = struc();
    s->levelsUsed = 0;
    s->changes++;
}

int ColumnW::changes() const
{
    return struc()->changes;
}

void ColumnW::setLevels(const vector<LevelData> &newLevels)
{
    if ( ! hasLevels())
        return;

    if (dataType() == DataType::INTEGER)
    {
        clearLevels();

        for (int i = 0; i < newLevels.size(); i++)
        {
            const LevelData &newLevel = newLevels[i];
            appendLevel(newLevel.ivalue(), newLevel.label(), newLevel.svalue());
        }

        for (int i = 0; i < rowCount(); i++)
        {
            int value = cellAt<int>(i);
            if (value != INT_MIN)
                setIValue(i, value, true);
        }
    }
    else if (dataType() == DataType::TEXT)
    {
        map<int, int> recode;
        const vector<LevelData> oldLevels = levels();

        for (int i = 0; i < newLevels.size(); i++)
        {
            const LevelData &newLevel = newLevels[i];
            for (int j = 0; j < oldLevels.size(); j++)
            {
                const LevelData &oldLevel = oldLevels[j];
                if (strcmp(oldLevel.svalue(), newLevel.svalue()) == 0)
                {
                    recode[j] = i;
                    break;
                }
            }
        }

        clearLevels();

        for (int i = 0; i < newLevels.size(); i++)
        {
            const LevelData &newLevel = newLevels[i];
            appendLevel(i, newLevel.label(), newLevel.svalue());
        }

        for (int i = 0; i < rowCount(); i++)
        {
            int value = cellAt<int>(i);
            if (value != INT_MIN)
                setIValue(i, recode[value], true);
        }
    }
    else
    {
        // shouldn't get here
    }
}

void ColumnW::changeDMType(DataType::Type dataType, MeasureType::Type measureType)
{
    if (measureType == MeasureType::NONE && dataType == DataType::NONE)
        return;

    /*
     * when changing the data/measure type, the innards of the column are
     * exchanged with a 'scratch' column. the old values are then copied to the
     * new innards, and the old column's innards become the scratch column
     * if the innards are swapped a *second* time, the column can return to how
     * it was; this allows for a person to make a mistake, and then return to
     * how things were.
     */

    DataSetW *ds = (DataSetW*)_parent;
    ColumnW old = ds->swapWithScratchColumn(*this);

    if (measureType != MeasureType::NONE)
    {
        if (measureType == MeasureType::CONTINUOUS)
        {
            if (dataType == DataType::TEXT || dataType == DataType::NONE)
            {
                if (old.dataType() == DataType::INTEGER)
                    dataType = DataType::INTEGER;
                else
                    dataType = DataType::DECIMAL;
            }
        }
        else
        {
            if (dataType == DataType::DECIMAL || dataType == DataType::NONE)
            {
                if (old.dataType() == DataType::INTEGER)
                    dataType = DataType::INTEGER;
                else
                    dataType = DataType::TEXT;
            }
        }
    }
    else // if (dataType != DataType::NONE)
    {
        if (dataType == DataType::DECIMAL)
            measureType = MeasureType::CONTINUOUS;
        else if (dataType == DataType::TEXT && measureType == MeasureType::CONTINUOUS)
            measureType = MeasureType::NOMINAL;
        else if (dataType == DataType::TEXT && old.measureType() == MeasureType::CONTINUOUS)
            measureType = MeasureType::NOMINAL;
        else
            measureType = old.measureType();
    }

    if (dataType == DataType::NONE)
        dataType = old.dataType();

    if (id() == old.id() && dataType == this->dataType() && measureType == this->measureType())
        return;

    if (id() == old.id() && this->dataType() == DataType::TEXT)
    {
        // if the new column is of type TEXT, we're better off copying *from*
        // this older column (TEXT is lossless); so we swap back again.

        old = ds->swapWithScratchColumn(*this);
    }
    else if (id() == old.id() && this->dataType() == DataType::DECIMAL)
    {
        // if the new column is DECIMAL, and the old column is INTEGER,
        // we're better off copying *from* the DECIMAL column, so we swap
        // back again.

        if (old.dataType() == DataType::INTEGER)
            old = ds->swapWithScratchColumn(*this);
    }


    setId(old.id());
    setDataType(dataType);
    setMeasureType(measureType);

    if (dataType == DataType::DECIMAL)
        _setRowCount<double>(_parent->rowCount());
    else if (dataType == DataType::TEXT && measureType == MeasureType::ID)
        _setRowCount<char*>(_parent->rowCount());
    else
        _setRowCount<int>(_parent->rowCount());

    ColumnW::_transferLevels(*this, old);

    if (dataType == DataType::INTEGER)
    {
        for (int rowNo = 0; rowNo < old.rowCount(); rowNo++)
        {
            int value = old.ivalue(rowNo);
            setIValue(rowNo, value, true);
        }
    }
    else if (dataType == DataType::TEXT)
    {
        if (measureType == MeasureType::ID)
        {
            for (int rowNo = 0; rowNo < rowCount(); rowNo++)
            {
                const char *value = old.svalue(rowNo);
                setSValue(rowNo, value, true);
            }
        }
        else
        {
            for (int rowNo = 0; rowNo < rowCount(); rowNo++)
            {
                const char *value = old.svalue(rowNo);

                if (value[0] != '\0')
                {
                    int levelIndex = valueForLabel(value);
                    setIValue(rowNo, levelIndex, true);
                }
                else
                {
                    setIValue(rowNo, INT_MIN, true);
                }
            }
        }
    }
    else if (dataType == DataType::DECIMAL)
    {
        for (int rowNo = 0; rowNo < old.rowCount(); rowNo++)
            setDValue(rowNo, old.dvalue(rowNo), true);
    }
}

int ColumnW::ivalue(int index)
{
    if (dataType() == DataType::INTEGER)
    {
        return cellAt<int>(index);
    }
    else if (dataType() == DataType::DECIMAL)
    {
        double value = cellAt<double>(index);
        if (isnan(value) || value < INT_MIN || value > INT_MAX)
            return INT_MIN;
        else
            return (int)value;
    }
    else // if (dataType() == DataType::TEXT)
    {
        const char *v = svalue(index);
        if (v[0] == '\0')
        {
            return INT_MIN;
        }
        else
        {
            int value;
            char junk;
            double d;
            if (sscanf(v, "%i%1c", &value, &junk) == 1)
                return value;
            else if (sscanf(v, "%lf%1c", &d, &junk) == 1)
                return (int) d;
            else
                return INT_MIN;
        }
    }
}

const char *ColumnW::svalue(int index)
{
    static string tmp;

    if (dataType() == DataType::INTEGER)
    {
        int value = cellAt<int>(index);
        if (value == INT_MIN)
        {
            return "";
        }
        else
        {
            stringstream ss;
            ss << value;
            tmp = ss.str();
            return tmp.c_str();
        }
    }
    else if (dataType() == DataType::DECIMAL)
    {
        double value = cellAt<double>(index);
        if (isnan(value) || value < INT_MIN || value > INT_MAX)
        {
            return "";
        }
        else
        {
            // we round and divide so it matches _transferLevels()
            int thous = (int)round(value * 1000);

            stringstream ss;
            ss.setf(ios::fixed);
            ss << setprecision(dps());
            ss << ((double)thous) / 1000;
            tmp = ss.str();
            return tmp.c_str();
        }
    }
    else if (dataType() == DataType::TEXT && measureType() == MeasureType::ID)
    {
        const char *value = cellAt<char*>(index);
        if (value == NULL)
            return "";
        else
            return _mm->resolve(value);
    }
    else // if (dataType() == DataType::TEXT)
    {
        int value = cellAt<int>(index);
        if (value == INT_MIN)
        {
            return "";
        }
        else
        {
            return getImportValue(value);
        }
    }
}

double ColumnW::dvalue(int index)
{
    if (dataType() == DataType::INTEGER)
    {
        int value = cellAt<int>(index);
        if (value == INT_MIN)
            return NAN;
        else
            return (double)value;
    }
    else if (dataType() == DataType::DECIMAL)
    {
        return cellAt<double>(index);
    }
    else // if (dataType() == DataType::TEXT)
    {
        const char *value = svalue(index);

        if (value[0] == '\0')
        {
            return NAN;
        }
        else
        {
            double d;
            char junk;
            if (sscanf(value, "%lf%1c", &d, &junk) == 1)
                return d;
            else
                return NAN;
        }
    }
}

void ColumnW::_transferLevels(ColumnW &dest, ColumnW &src)
{
    dest.clearLevels();
    if ( ! dest.hasLevels())
        return;

    int count = 0;

    if (src.hasLevels())
    {
        vector<LevelData> levels = src.levels();
        vector<LevelData>::iterator itr;

        for (itr = levels.begin(); itr != levels.end(); itr++)
        {
            LevelData &level = *itr;

            if (dest.dataType() == DataType::TEXT)
            {
                const char *value = level.svalue();
                if (value[0] != '\0')
                    dest.appendLevel(count++, level.label(), level.svalue());
            }
            else
            {
                int value = level.ivalue();
                if (value != INT_MIN && ! dest.hasLevel(value))
                {
                    if (level.hasLabelChanged())
                        dest.insertLevel(value, level.label(), level.svalue());
                    else
                        dest.insertLevel(value);
                }
            }
        }
    }
    else
    {
        if (dest.dataType() == DataType::TEXT)
        {
            if (src.dataType() == DataType::DECIMAL)
            {
                set<int> values;

                for (int i = 0; i < src.rowCount(); i++)
                {
                    double value = src.dvalue(i);
                    if ( ! isnan(value))
                        values.insert((int)round(value * 1000));
                }

                int count = 0;
                set<int>::iterator itr;
                for (itr = values.begin(); itr != values.end(); itr++)
                {
                    int value = *itr;
                    stringstream ss;
                    ss.setf(ios::fixed);
                    ss << setprecision(src.dps());
                    ss << ((double)value) / 1000;
                    string v = ss.str();
                    dest.insertLevel(count++, v.c_str(), v.c_str());
                }
            }
            else if (src.dataType() == DataType::INTEGER)
            {
                int value;
                for (int i = 0; i < src.rowCount(); i++)
                {
                    value = src.ivalue(i);
                    if (value != INT_MIN && ! dest.hasLevel(value))
                        dest.insertLevel(value, src.svalue(i));
                }

                ColumnStruct *s = dest.struc();
                Level *levels = dest._mm->resolve(s->levels);
                for (int i = 0; i < s->levelsUsed; i++)
                    levels[i].value = i;
            }
            else
            {
                int count = 0;
                for (int i = 0; i < src.rowCount(); i++)
                {
                    const char *value = src.svalue(i);
                    if (value[0] != '\0' && ! dest.hasLevel(value))
                        dest.appendLevel(count++, value);
                }
            }
        }
        else if (dest.dataType() == DataType::INTEGER)
        {
            for (int i = 0; i < src.rowCount(); i++)
            {
                int value = src.ivalue(i);
                if (value != INT_MIN && ! dest.hasLevel(value))
                {
                    if (src.dataType() == DataType::DECIMAL)
                        dest.insertLevel(value); // src.svalue() would return a decimal string
                    else
                        dest.insertLevel(value, src.svalue(i));
                }
            }
        }
    }
}

void ColumnW::_discardScratchColumn()
{
    DataSetW *ds = (DataSetW*)_parent;
    ds->discardScratchColumn(id());
}
