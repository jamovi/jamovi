//
// Copyright (C) 2016 Jonathon Love
//

#include "column.h"

#include <stdexcept>
#include <climits>
#include <sstream>
#include <cstring>
#include <iomanip>

#include "dataset.h"

using namespace std;

Column::Column(DataSet *parent, MemoryMap *mm, ColumnStruct *rel)
{
    _parent = parent;
    _mm = mm;
    _rel = rel;
}

int Column::id() const {
    return struc()->id;
}

const char *Column::name() const
{
    return _mm->resolve(struc()->name);
}

const char *Column::importName() const
{
    return _mm->resolve(struc()->importName);
}

ColumnType::Type Column::columnType() const
{
    return (ColumnType::Type) struc()->columnType;
}

DataType::Type Column::dataType() const
{
    return (DataType::Type) struc()->dataType;
}

MeasureType::Type Column::measureType() const
{
    return (MeasureType::Type) struc()->measureType;
}

bool Column::autoMeasure() const {
    return struc()->autoMeasure;
}

int Column::rowCount() const {
    return struc()->rowCount;
}

int Column::rowCountExFiltered() const {
    return _parent->rowCountExFiltered();
}

int Column::dps() const
{
    return struc()->dps;
}

bool Column::active() const
{
    return struc()->active;
}

bool Column::trimLevels() const
{
    return struc()->trimLevels;
}

const char *Column::formula() const
{
    if (struc()->formula == NULL)
        return NULL;
    return _mm->resolve(struc()->formula);
}

const char *Column::formulaMessage() const
{
    if (struc()->formulaMessage == NULL)
        return NULL;
    return _mm->resolve(struc()->formulaMessage);
}

ColumnStruct *Column::struc() const
{
    return _mm->resolve(_rel);
}

int Column::levelCount() const
{
    return struc()->levelsUsed;
}

int Column::levelCountExFilteredExMissing() const
{
    int count = 0;
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);
    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        if (level.countExFiltered > 0 && level.treatAsMissing == false)
            count++;
    }
    return count;
}

const char* Column::raws(int index)
{
    const char *value = cellAt<char*>(index);
    if (value == NULL)
        return "";
    else
        return _mm->resolve(value);
}

const vector<MissingValue> Column::missingValues() const
{
    vector<MissingValue> m;

    ColumnStruct *s = struc();
    MissingValue *missingValues = _mm->resolve(s->missingValues);

    for (int i = 0; i < s->missingValuesUsed; i++)
    {
        MissingValue &mv = missingValues[i];

        MissingValue cmv;
        cmv.type = mv.type;
        cmv.optr = mv.optr;
        cmv.value = mv.value;
        if (mv.type == 0)
            cmv.value.s = _mm->resolve(mv.value.s);

        m.push_back(cmv);
    }

    return m;
}

const vector<LevelData> Column::levels() const
{
    vector<LevelData> m;

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        bool filtered = l.countExFiltered == 0;
        bool treatAsMissing = l.treatAsMissing;

        if (dataType() == DataType::TEXT)
        {
            char *value = _mm->resolve(l.importValue);
            char *label = _mm->resolve(l.label);
            m.push_back(LevelData(value, label, filtered, treatAsMissing));
        }
        else
        {
            int value   = l.value;
            char *label = _mm->resolve(l.label);
            m.push_back(LevelData(value, label, filtered, treatAsMissing));
        }
    }

    return m;
}

bool Column::hasUnusedLevels() const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        if (l.countExFiltered == 0)
            return true;
    }

    return false;
}

const char *Column::getLabel(const char* value) const
{
    if (value[0] == '\0')
        return value;

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        const char *importValue = _mm->resolve(l.importValue);
        if (strcmp(importValue, value) == 0)
            return _mm->resolve(l.label);
    }

    stringstream ss;
    ss << "level " << value << " not found in " << this->name();
    throw runtime_error(ss.str());
}

const char *Column::getLabel(int value) const
{
    if (value == INT_MIN)
        return "";

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        if (l.value == value)
            return _mm->resolve(l.label);
    }

    stringstream ss;
    ss << "level " << value << " not found in " << this->name();
    throw runtime_error(ss.str());
}

const char *Column::getImportValue(int value) const
{
    if (value == INT_MIN)
        return "";

    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &l = levels[i];
        if (l.value == value) {
            char *iv = _mm->resolve(l.importValue);
            if (iv[0] != '\0')
                return iv;
            else
                return _mm->resolve(l.label);
        }
    }

    stringstream ss;
    ss << "level " << value << " not found";
    throw runtime_error(ss.str());
}

int Column::valueForLabel(const char *label) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        const char *l = _mm->resolve(level.label);
        if (strcmp(l, label) == 0)
        {
            return level.value;
        }
        else
        {
            const char *iv = _mm->resolve(level.importValue);
            if (strcmp(iv, label) == 0)
                return level.value;
        }
    }

    stringstream ss;
    ss << "level '" << label << "' not found";
    throw runtime_error(ss.str());
}

bool Column::hasLevels() const
{
    return measureType() != MeasureType::CONTINUOUS &&
           measureType() != MeasureType::ID;
}

bool Column::hasLevel(const char *label) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        const char *l = _mm->resolve(level.label);
        if (strcmp(l, label) == 0)
        {
            return true;
        }
        else
        {
            const char *iv = _mm->resolve(level.importValue);
            if (strcmp(iv, label) == 0)
                return true;
        }
    }

    return false;
}

bool Column::hasLevel(int value) const
{
    return rawLevel(value) != NULL;
}

Level *Column::rawLevel(int value) const
{
    ColumnStruct *s = struc();
    Level *levels = _mm->resolve(s->levels);

    for (int i = 0; i < s->levelsUsed; i++)
    {
        Level &level = levels[i];
        if (level.value == value)
            return &level;
    }

    return NULL;
}

int Column::getIndexExFiltered(int index)
{
    return _parent->getIndexExFiltered(index);
}

bool Column::shouldTreatAsMissing(int rowIndex)
{
    if (hasLevels())
    {
        int v = raw<int>(rowIndex);
        const char *sv = getLabel(v);
        const char *sv2 = getImportValue(v);
        int iv = ivalue(rowIndex);
        double dv = dvalue(rowIndex);

        return shouldTreatAsMissing(sv, iv, dv, sv2);
    }
    else
    {
        const char *sv = svalue(rowIndex);
        const char *sv2 = NULL;
        int iv = ivalue(rowIndex);
        double dv = dvalue(rowIndex);

        return shouldTreatAsMissing(sv, iv, dv, sv2);
    }
}

bool Column::shouldTreatAsMissing(const char *sv, const char *sv2)
{
    return shouldTreatAsMissing(sv, INT_MIN, NAN, sv2);
}

bool Column::shouldTreatAsMissing(const char *sv, int iv, double dv, const char *sv2)
{
    const ColumnStruct *s = struc();
    int count = s->missingValuesUsed;
    if (count == 0)
        return false;

    const MissingValue *mvs = _mm->resolve(s->missingValues);

    for (int i = 0; i < count; i++)
    {
        const MissingValue &mv = mvs[i];

        if (mv.type == 0 && sv != NULL)
        {
            const char *sc = _mm->resolve(mv.value.s);
            int scmp = strcmp(sv, sc);

            if (scmp == 0)
            {
                if (mv.optr == 0 || mv.optr == 2 || mv.optr == 3)
                    return true;
            }
            else if (mv.optr == 0 && sv2 != NULL)
            {
                // if `$source == 'a string'` is false, we also check the import value
                scmp = strcmp(sv2, sc);
                if (scmp == 0)
                    return true;
            }
            else if (scmp > 0)
            {
                if (mv.optr == 1 || mv.optr == 3 || mv.optr == 5)
                    return true;
            }
            else if (scmp < 0)
            {
                if (mv.optr == 1 || mv.optr == 2 || mv.optr == 4)
                    return true;
            }
        }
        else if (mv.type == 1 && ! isnan(dv))
        {
            double dc = mv.value.d;

            switch (mv.optr)
            {
            case 0:
                if (dv == dc)
                    return true;
                break;
            case 1:
                if (dv != dc)
                    return true;
                break;
            case 2:
                if (dv <= dc)
                    return true;
                break;
            case 3:
                if (dv >= dc)
                    return true;
                break;
            case 4:
                if (dv < dc)
                    return true;
                break;
            case 5:
                if (dv > dc)
                    return true;
                break;
            }
        }
        else if (mv.type == 2 && iv != INT_MIN)
        {
            int ic = mv.value.i;

            switch (mv.optr)
            {
            case 0:
                if (iv == ic)
                    return true;
                break;
            case 1:
                if (iv != ic)
                    return true;
                break;
            case 2:
                if (iv <= ic)
                    return true;
                break;
            case 3:
                if (iv >= ic)
                    return true;
                break;
            case 4:
                if (iv < ic)
                    return true;
                break;
            case 5:
                if (iv > ic)
                    return true;
                break;
            }
        }
    }

    return false;
}

int Column::ivalue(int index)
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

const char *Column::svalue(int index)
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
        if (isnan(value) || value < INT64_MIN || value > INT64_MAX)
        {
            return "";
        }
        else
        {
            // we round and divide so it matches _transferLevels()
            int64_t thous = (int64_t)round(value * 1000);

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

double Column::dvalue(int index)
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
