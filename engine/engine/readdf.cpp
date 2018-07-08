
#include "readdf.h"

#include "memorymap.h"
#include "dataset.h"

#include <string>
#include <vector>
#include <map>

using namespace Rcpp;
using namespace std;

// [[Rcpp::export]]
DataFrame readDF(
        String path,
        SEXP columnsReq,
        bool headerOnly)
{
    MemoryMap *mm;

    try
    {
        mm = MemoryMap::attach(path);
    }
    catch (std::exception e)
    {
        std::cout << e.what() << "\n";
        std::cout.flush();
        throw e;
    }

    DataSet &dataset = *DataSet::retrieve(mm);

    int columnCount = dataset.columnCount();
    int rowCount = 0;
    int rowCountExFiltered = 0;

    if ( ! headerOnly)
    {
        rowCount = dataset.rowCount();
        rowCountExFiltered = dataset.rowCountExFiltered();
    }

    CharacterVector rowNames(rowCountExFiltered);

    int rowNo = 0;
    int colNo = 0;

    for (int i = 0; i < rowCount; i++)
    {
        if ( ! dataset.isRowFiltered(i))
            rowNames[rowNo++] = String(std::to_string(i));
    }

    bool readAllColumns;
    StringVector columnsRequired;
    List columns;
    CharacterVector columnNames;

    if (Rf_isNull(columnsReq))
    {
        readAllColumns = true;
        columns = List(columnCount);
        columnNames = CharacterVector(columnCount);
    }
    else
    {
        readAllColumns = false;
        columnsRequired = as<StringVector>(columnsReq);
        columns = List(columnsRequired.size());
        columnNames = CharacterVector(columnsRequired.size());
    }

    for (int i = 0; i < columnCount; i++)
    {
        Column column = dataset[i];
        string columnName = column.name();

        if ( ! readAllColumns)
        {
            bool required = false;
            StringVector::iterator itr;
            for (itr = columnsRequired.begin(); itr != columnsRequired.end(); itr++)
            {
                if (as<string>(*itr) == columnName)
                    required = true;
            }
            if ( ! required)
                continue;
        }

        columnNames[colNo] = String(columnName);

        if (column.dataType() == DataType::DECIMAL)
        {
            NumericVector v(rowCountExFiltered, NumericVector::get_na());
            rowNo = 0;

            for (int j = 0; j < rowCount; j++)
            {
                if ( ! dataset.isRowFiltered(j))
                    v[rowNo++] = column.value<double>(j);
            }

            columns[colNo] = v;
        }
        else if (column.measureType() == MeasureType::CONTINUOUS)
        {
            IntegerVector v(rowCountExFiltered, IntegerVector::get_na());
            rowNo = 0;

            for (int j = 0; j < rowCount; j++)
            {
                if ( ! dataset.isRowFiltered(j))
                    v[rowNo++] = column.value<int>(j);
            }

            columns[colNo] = v;
        }
        else
        {
            int MISSING = IntegerVector::get_na();

            // populate levels

            vector<LevelData> m;
            if (column.trimLevels())
                m = column.levelsExFiltered();
            else
                m = column.levels();

            CharacterVector levels = CharacterVector(m.size());
            IntegerVector values = IntegerVector(m.size());

            map<int, int> indexes;
            int j = 0;

            for (auto p : m)
            {
                int value;
                if (column.dataType() == DataType::TEXT)
                    value = j;
                else
                    value = p.ivalue();

                values[j] = value;
                levels[j] = String(p.label());
                j++;
                indexes[value] = j;
            }

            // populate cells

            IntegerVector v(rowCountExFiltered, MISSING);
            rowNo = 0;

            for (j = 0; j < rowCount; j++)
            {
                if ( ! dataset.isRowFiltered(j))
                {
                    int value = column.value<int>(j);
                    if (value != MISSING)
                        v[rowNo] = indexes[value];
                    rowNo++;
                }
            }

            // assign levels

            v.attr("levels") = levels;

            if (column.dataType() == DataType::TEXT)
            {
                if (column.measureType() == MeasureType::ORDINAL)
                    v.attr("class") = CharacterVector::create("ordered", "factor");
                else
                    v.attr("class") = "factor";
            }
            else
            {
                v.attr("values") = values;

                if (column.measureType() == MeasureType::ORDINAL)
                    v.attr("class") = CharacterVector::create("SilkyFactor", "ordered", "factor");
                else
                    v.attr("class") = CharacterVector::create("SilkyFactor", "factor");
            }

            if ( ! column.trimLevels() && column.hasUnusedLevels())
            {
                v.attr("jmv-unused-levels") = true;
            }

            columns[colNo] = v;
        }

        colNo++;
    }

    columns.attr("names") = columnNames;
    columns.attr("row.names") = rowNames;
    columns.attr("class") = "data.frame";

    return columns;
}
