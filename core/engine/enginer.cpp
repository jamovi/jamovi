//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

#include <sstream>
#include <boost/filesystem.hpp>
#include <boost/algorithm/string/split.hpp>
#include <boost/algorithm/string/classification.hpp>
#include <algorithm>

#include <boost/nowide/cstdlib.hpp>

#include "settings.h"
#include "dirs2.h"
#include "memorymap.h"
#include "dataset2.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

void EngineR::run(Analysis *analysis)
{
    if (_rInside == NULL)
        initR();
    
    RInside &rInside = *_rInside;

    stringstream ss;
    
    ss << "{\n";
    ss << "  options <- silkycore::Options$new('" << analysis->options << "', vars=c('a', 'b', 'f'), freq=TRUE)\n";
    ss << "  analysis <- " << analysis->ns << "::" << analysis->name << "Class$new(package='" << analysis->ns << "', name='" << analysis->name << "', id=" << analysis->id << ", options=options)\n";
    ss << "}\n";
    
    rInside.parseEvalQNT(ss.str());

    string datasetId = analysis->datasetId;

    if (analysis->requiresDataset)
    {
        std::function<Rcpp::DataFrame(vector<string>)> readDataset = std::bind(&EngineR::readDataset, this, datasetId, placeholders::_1);
        rInside["readDataset"] = Rcpp::InternalFunction(readDataset);
        rInside.parseEvalQNT("analysis$.setReadDatasetSource(readDataset)\n");
        rInside.parseEvalQNT("rm(list='readDataset')\n");
        rInside.parseEvalQNT("analysis$readDataset()\n");
    }
    
    std::function<Rcpp::CharacterVector()> statePath = std::bind(&EngineR::statePath, this, datasetId, analysis->id);
    rInside["statePath"] = Rcpp::InternalFunction(statePath);
    rInside.parseEvalQNT("analysis$.setStatePathSource(statePath)");
    rInside.parseEvalQNT("rm(list='statePath')\n");
    
    ss.str(""); // clear
    
    ss << "{\n";
    ss << "  serial <- RProtoBuf::serialize(analysis$asProtoBuf(), NULL)\n";
    ss << "  serial\n";
    ss << "}\n";

    Rcpp::RawVector rawVec = rInside.parseEvalNT(ss.str());
    std::string raw(rawVec.begin(), rawVec.end());
    resultsReceived(raw);
    
    ss.str(""); // clear
    
    ss << "{\n";
    ss << "  analysis$run()\n";
    ss << "  serial <- RProtoBuf::serialize(analysis$asProtoBuf(), NULL)\n";
    ss << "  serial\n";
    ss << "}\n";

    Rcpp::RawVector rawVec2 = rInside.parseEvalNT(ss.str());
    std::string raw2(rawVec2.begin(), rawVec2.end());
    resultsReceived(raw2);
}

Rcpp::DataFrame EngineR::readDataset(const string &datasetId, const vector<string> &columnsRequired)
{
    if (_rInside == NULL)
        initR();
    
    filesystem::path p = datasetId;
    p /= "buffer";
    string path = p.generic_string();
        
    MemoryMap *mm = MemoryMap::attach(path);
    DataSet2 &dataset = *DataSet2::retrieve(mm);
    
    int columnCount = dataset.columnCount();
    int rowCount = dataset.rowCount();
    
    Rcpp::List columns(columnsRequired.size());
    Rcpp::CharacterVector columnNames(columnsRequired.size());
    
    int index = 0;
    
    for (int i = 0; i < columnCount; i++)
    {
        Column2 column = dataset[i];
        string columnName = column.name();
        
        if (find(columnsRequired.begin(), columnsRequired.end(), columnName) == columnsRequired.end())
            continue;
        
        columnNames[index] = columnName;
        
        if (column.columnType() == Column2::Continuous)
        {
            Rcpp::NumericVector v(rowCount, Rcpp::NumericVector::get_na());
            
            for (int j = 0; j < rowCount; j++)
                v[j] = column.cell<double>(j);
            
            columns[index] = v;
        }
        else
        {
            int MISSING = Rcpp::IntegerVector::get_na();
            
            // populate labels
            
            map<int, string> m = column.labels();
            
            Rcpp::CharacterVector labels(m.size());
            Rcpp::IntegerVector values(m.size());

            map<int, int> indexes;
            int j = 0;
            
            for (auto p : m)
            {
                values[j] = p.first;
                labels[j] = p.second;
                j++;
                indexes[p.first] = j;
            }
            
            // populate cells

            Rcpp::IntegerVector v(rowCount, MISSING);
            
            for (j = 0; j < rowCount; j++)
            {
                int value = column.cell<int>(j);
                if (value != MISSING)
                    v[j] = indexes[value];
            }
            
            // assign labels
            
            v.attr("levels") = labels;
            
            if (column.columnType() == Column2::NominalText)
            {
                v.attr("class") = "factor";
            }
            else
            {
                v.attr("values") = values;
                v.attr("class") = Rcpp::CharacterVector::create("SilkyFactor", "factor");
            }

            columns[index] = v;        
        }
        
        index++;
    }
    
    columns.attr("names") = columnNames;
    
    return Rcpp::DataFrame(columns);
}

Rcpp::CharacterVector EngineR::statePath(const string &datasetId, int analysisId)
{
    stringstream ss;
    ss << datasetId << "/" << analysisId;
    
    filesystem::path analysisPath = filesystem::path(ss.str());
    filesystem::create_directories(analysisPath);
    
    ss << "/state";
    
    return ss.str();
}

void EngineR::initR()
{
    string path;
    
    path = Settings::get("R_HOME", "");
    if (path != "")
        nowide::setenv("R_HOME", makeAbsolute(path).c_str(), 1);

    path = Settings::get("R_LIBS", "");
    if (path != "")
        nowide::setenv("R_LIBS", makeAbsolute(path).c_str(), 1);
    
    nowide::setenv("R_ENVIRON", "something-which-doesnt-exist", 1);
    nowide::setenv("R_PROFILE", "something-which-doesnt-exist", 1);
    nowide::setenv("R_PROFILE_USER", "something-which-doesnt-exist", 1);
    nowide::setenv("R_ENVIRON_USER", "something-which-doesnt-exist", 1);
    nowide::setenv("R_LIBS_SITE", "something-which-doesnt-exist", 1);
    nowide::setenv("R_LIBS_USER", "something-which-doesnt-exist", 1);
            
    _rInside = new RInside();
    
    // calls to methods functions on windows fail without this
    _rInside->parseEvalQNT("suppressPackageStartupMessages(library('methods'))");
}

string EngineR::makeAbsolute(const string &paths)
{
    vector<string> out;
    algorithm::split(out, paths, algorithm::is_any_of(";:"), token_compress_on);
    
    stringstream result;
    string sep = "";
    
    filesystem::path here = Dirs2::exeDir();

    for (string &p : out)
    {
        system::error_code ec;
        filesystem::path path = p;
        path = canonical(path, here, ec);
        
        result << sep << path.generic_string();
        
#ifdef _WIN32
        sep = ";";
#else
        sep = ":";
#endif
    }
    
    return result.str();
}
