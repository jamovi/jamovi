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
#include <boost/nowide/fstream.hpp>

#include "settings.h"
#include "dirs2.h"
#include "memorymap.h"
#include "dataset2.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

void EngineR::setPath(const std::string &path)
{
    _path = path;
}

void EngineR::run(Analysis *analysis)
{
    if (_rInside == NULL)
        initR();

    RInside &rInside = *_rInside;

    stringstream ss;

    ss << "{\n";
    ss << "  options <- silkycore::Options$new(package='" << analysis->ns << "', name='" << analysis->name << "', json='" << analysis->options << "')\n";
    ss << "  analysis <- " << analysis->ns << "::" << analysis->name << "Class$new(package='" << analysis->ns << "', name='" << analysis->name << "', datasetId='" << analysis->datasetId << "', analysisId=" << analysis->id << ", options=options)\n";
    ss << "}\n";

    rInside.parseEvalQNT(ss.str());

    std::function<Rcpp::DataFrame(Rcpp::List)> readDatasetHeader;
    std::function<Rcpp::DataFrame(Rcpp::List)> readDataset;

    readDatasetHeader = std::bind(&EngineR::readDataset, this, analysis->datasetId, std::placeholders::_1, true);
    rInside["readDatasetHeader"] = Rcpp::InternalFunction(readDatasetHeader);
    rInside.parseEvalQNT("analysis$.setReadDatasetHeaderSource(readDatasetHeader)\n");

    readDataset = std::bind(&EngineR::readDataset, this, analysis->datasetId, std::placeholders::_1, false);
    rInside["readDataset"] = Rcpp::InternalFunction(readDataset);
    rInside.parseEvalQNT("analysis$.setReadDatasetSource(readDataset)\n");

    std::function<string()> statePath = std::bind(&EngineR::statePath, this, analysis->datasetId, analysis->nameAndId);
    rInside["statePath"] = Rcpp::InternalFunction(statePath);
    rInside.parseEvalQNT("analysis$.setStatePathSource(statePath)");

    std::function<Rcpp::List(const string &, const string &)> resourcesPath = std::bind(&EngineR::resourcesPath, this, analysis->datasetId, analysis->nameAndId, std::placeholders::_1, std::placeholders::_2);
    rInside["resourcesPath"] = Rcpp::InternalFunction(resourcesPath);
    rInside.parseEvalQNT("analysis$.setResourcesPathSource(resourcesPath)");

    std::function<void(SEXP)> check = std::bind(&EngineR::checkpoint, this, std::placeholders::_1);
    rInside["checkpoint"] = Rcpp::InternalFunction(check);
    rInside.parseEvalQNT("analysis$.setCheckpoint(checkpoint)");

    rInside.parseEvalQNT("rm(list=c('readDatasetHeader', 'readDataset', 'statePath', 'resourcesPath', 'checkpoint'))\n");

    rInside.parseEvalQNT("analysis$init();analysis$.load()\n");

    Rcpp::RawVector rawVec = _rInside->parseEvalNT("RProtoBuf::serialize(analysis$asProtoBuf(), NULL)\n");
    std::string raw(rawVec.begin(), rawVec.end());
    resultsReceived(raw);

    rInside.parseEvalQNT("analysis$run();analysis$render();analysis$.save()\n");

    Rcpp::RawVector rawVec2 = _rInside->parseEvalNT("RProtoBuf::serialize(analysis$asProtoBuf(), NULL)\n");
    std::string raw2(rawVec2.begin(), rawVec2.end());
    resultsReceived(raw2);
}

void EngineR::checkpoint(SEXP results)
{
    if ( ! Rf_isNull(results)) {
        Rcpp::RawVector rawVec = Rcpp::as<Rcpp::RawVector>(results);
        std::string raw(rawVec.begin(), rawVec.end());
        resultsReceived(raw);
    }
}

Rcpp::DataFrame EngineR::readDataset(const string &datasetId, Rcpp::List columnsRequired, bool headerOnly)
{
    if (_rInside == NULL)
        initR();

    filesystem::path p = _path;
    p /= datasetId;
    p /= "buffer";
    string path = p.generic_string();

    MemoryMap *mm = MemoryMap::attach(path);
    DataSet2 &dataset = *DataSet2::retrieve(mm);

    int columnCount = dataset.columnCount();
    int rowCount;

    if (headerOnly)
        rowCount = 0;
    else
        rowCount = dataset.rowCount();

    Rcpp::List columns(columnsRequired.size());
    Rcpp::CharacterVector columnNames(columnsRequired.size());
    Rcpp::CharacterVector rowNames(rowCount);

    for (int i = 0; i < rowCount; i++)
        rowNames[i] = std::to_string(i);

    int index = 0;

    for (int i = 0; i < columnCount; i++)
    {
        Column2 column = dataset[i];
        string columnName = column.name();

        bool required = false;

        for (string hay : columnsRequired)
        {
            if (hay == columnName)
                required = true;
        }

        if ( ! required)
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
    columns.attr("row.names") = rowNames;
    columns.attr("class") = "data.frame";

    return columns;
}

string EngineR::analysisDirPath(const std::string &datasetId, const string &analysisId)
{
    stringstream ss;
    ss << _path << "/" << datasetId << "/" << analysisId;
    string path = ss.str();

    EngineR::createDirectories(path);

    return path;
}

std::string EngineR::statePath(const string &datasetId, const string &analysisId)
{
    return analysisDirPath(datasetId, analysisId) + "/state";
}

Rcpp::List EngineR::resourcesPath(const std::string &datasetId, const string &analysisId, const std::string &elementId, const std::string &suffix)
{
    string rootPath = _path + "/" + datasetId;
    string relPath = analysisId + "/resources";
    string fullPath = rootPath + "/" + relPath;

    EngineR::createDirectories(fullPath);

    relPath += "/" + elementId;

    if (suffix != "")
        relPath += "." + suffix;

    return Rcpp::List::create(
        Rcpp::Named("rootPath") = rootPath,
        Rcpp::Named("relPath") = relPath);
}

void EngineR::createDirectories(const string &path)
{
    filesystem::path fpath = filesystem::path(path);
    filesystem::create_directories(fpath);
}

void EngineR::initR()
{
    string path;

    path = Settings::get("ENV.R_HOME", "");
    if (path != "")
        nowide::setenv("R_HOME", makeAbsolute(path).c_str(), 1);

    path = Settings::get("ENV.R_LIBS", "");
    if (path != "")
        nowide::setenv("R_LIBS", makeAbsolute(path).c_str(), 1);

    path = Settings::get("ENV.FONTCONFIG_PATH", "");
    if (path != "")
        nowide::setenv("FONTCONFIG_PATH", makeAbsolute(path).c_str(), 1);

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
