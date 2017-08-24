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

#include "dirs.h"
#include "memorymap.h"
#include "dataset.h"
#include "utils.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

EngineR::EngineR()
{
    this->initR();
}

void EngineR::setPath(const std::string &path)
{
    _path = path;
}

void EngineR::run(Analysis *analysis)
{
    _current = analysis; // assigned so callbacks can access it

    if (_rInside == NULL)
        initR();

    RInside &rInside = *_rInside;

    Rcpp::RawVector optionsVec(analysis->options.size());
    std::copy(analysis->options.begin(), analysis->options.end(), optionsVec.begin());

    rInside["optionsPB"] = optionsVec;

    setLibPaths(analysis->ns);

    stringstream ss;

    ss << "analysis <- jmvcore::create(" <<
        "'" << analysis->ns << "', " <<
        "'" << analysis->name << "', " <<
        "optionsPB, " <<
        "'" << analysis->datasetId << "', " <<
        analysis->id << ", " <<
        analysis->revision << ")\n";

    rInside.parseEvalQNT(ss.str());

    if (rInside.parseEvalNT("analysis$errored\n")) {
        sendResults(true, true);
        return;
    }

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

    std::function<SEXP(SEXP)> checkpoint = std::bind(&EngineR::checkpoint, this, std::placeholders::_1);
    rInside["checkpoint"] = Rcpp::InternalFunction(checkpoint);
    rInside.parseEvalQNT("analysis$.setCheckpoint(checkpoint)");

    rInside.parseEvalQNT("rm(list=c('optionsPB', 'readDatasetHeader', 'readDataset', 'statePath', 'resourcesPath', 'checkpoint'))\n");

    rInside.parseEvalQNT("analysis$init(noThrow=TRUE)");

    if (rInside.parseEvalNT("analysis$errored\n")) {
        sendResults(true, true);
        return;
    }

    if ( ! analysis->clearState)
    {
        Rcpp::CharacterVector changed(analysis->changed.begin(), analysis->changed.end());
        rInside["changed"] = changed;
        rInside.parseEvalQ("try(analysis$.load(changed))");
    }

    if (analysis->perform == 5)  // SAVE
    {
        ss.str("");
        ss << "result <- try(";
        ss << "  analysis$.savePart(";
        ss << "  path='" << analysis->path << "',";
        ss << "  part='" << analysis->part << "',";
        ss << "  format='" << analysis->format << "')";
        ss << ", silent=TRUE);";
        ss << "if (inherits(result, 'try-error')) {";
        ss << "  result <- jmvcore::extractErrorMessage(result)";
        ss << "} else {";
        ss << "  result <- ''";  // success
        ss << "};";
        ss << "result";

        std::string result = rInside.parseEval(ss.str());

        opEventReceived(result);
    }
    else if (rInside.parseEvalNT("analysis$errored || analysis$complete"))
    {
        sendResults(true, true);
        rInside.parseEvalQ("try(analysis$.save())");
    }
    else if (analysis->perform == 0)   // INIT
    {
        sendResults();
        rInside.parseEvalQ("try(analysis$.save())");
    }
    else
    {
        sendResults();

        bool shouldSend = rInside.parseEvalNT("analysis$run(noThrow=TRUE);");
        if ( ! shouldSend)
            return;

        sendResults();
        rInside.parseEvalQNT("analysis$.createImages(noThrow=TRUE);");
        sendResults();
        sendResults(true, true);
        rInside.parseEvalQ("try(analysis$.save())");
    }
}

void EngineR::sendResults(bool incOptions, bool incAsText)
{
    stringstream ss;
    ss << "analysis$serialize(";
    ss << "incOptions=" << (incOptions ? "TRUE" : "FALSE") << ", ";
    ss << "incAsText=" << (incAsText ? "TRUE" : "FALSE") << ")\n";
    Rcpp::RawVector rawVec = _rInside->parseEval(ss.str());
    string raw(rawVec.begin(), rawVec.end());
    resultsReceived(raw);
}

void EngineR::setLibPaths(const std::string &moduleName)
{
    stringstream ss;

    char *cPath;
    string path;
    vector<string> sysR;
    vector<string> moduleR;

    cPath = nowide::getenv("R_LIBS");
    if (cPath != NULL)
        path = cPath;

    algorithm::split(sysR, path, algorithm::is_any_of(";:"), token_compress_on);

    cPath = nowide::getenv("JAMOVI_MODULES_PATH");
    if (cPath != NULL)
        path = cPath;

    algorithm::split(moduleR, path, algorithm::is_any_of(";:"), token_compress_on);

    ss << "base::.libPaths(c(";

    ss << "'" << Dirs::appDataDir() << "/modules/" << moduleName << "/R'";

    for (auto path : moduleR)
    {
        ss << ",'" << makeAbsolute(path) << "/" << moduleName << "/R'";
        ss << ",'" << makeAbsolute(path) << "/base/R'";
    }

    for (auto path : sysR)
        ss << ",'" << makeAbsolute(path) << "'";

    ss << "))\n";

    _rInside->parseEvalQNT(ss.str());
}

SEXP EngineR::checkpoint(SEXP results)
{
    Analysis *analysis = _checkForNew();

    if (analysis != NULL)
        return Rcpp::CharacterVector("restart");

    if ( ! Rf_isNull(results)) {
        Rcpp::RawVector rawVec = Rcpp::as<Rcpp::RawVector>(results);
        std::string raw(rawVec.begin(), rawVec.end());
        resultsReceived(raw);
    }

    return R_NilValue;
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
    DataSet &dataset = *DataSet::retrieve(mm);

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
        rowNames[i] = Rcpp::String(std::to_string(i));

    int index = 0;

    for (int i = 0; i < columnCount; i++)
    {
        Column column = dataset[i];
        string columnName = column.name();

        bool required = false;

        for (string hay : columnsRequired)
        {
            if (hay == columnName)
                required = true;
        }

        if ( ! required)
            continue;

        columnNames[index] = Rcpp::String(columnName);

        if (column.measureType() == MeasureType::CONTINUOUS)
        {
            Rcpp::NumericVector v(rowCount, Rcpp::NumericVector::get_na());

            for (int j = 0; j < rowCount; j++)
                v[j] = column.value<double>(j);

            columns[index] = v;
        }
        else
        {
            int MISSING = Rcpp::IntegerVector::get_na();

            // populate levels

            vector<LevelData > m = column.levels();

            Rcpp::CharacterVector levels(m.size());
            Rcpp::IntegerVector values(m.size());

            map<int, int> indexes;
            int j = 0;

            for (auto p : m)
            {
                values[j] = p.value;
                levels[j] = Rcpp::String(p.label);
                j++;
                indexes[p.value] = j;
            }

            // populate cells

            Rcpp::IntegerVector v(rowCount, MISSING);

            for (j = 0; j < rowCount; j++)
            {
                int value = column.value<int>(j);
                if (value != MISSING)
                    v[j] = indexes[value];
            }

            // assign levels

            v.attr("levels") = levels;

            if (column.measureType() == MeasureType::NOMINAL_TEXT)
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

void EngineR::setCheckForNewCB(std::function<Analysis*()> check)
{
    _checkForNew = check;
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
    return analysisDirPath(datasetId, analysisId) + "/analysis";
}

Rcpp::List EngineR::resourcesPath(const std::string &datasetId, const string &analysisId, const std::string &elementId, const std::string &suffix)
{
    string rootPath = _path + "/" + datasetId;
    string relPath = analysisId + "/resources";
    string fullPath = rootPath + "/" + relPath;

    EngineR::createDirectories(fullPath);

    fullPath += "/%%%%%%%%%%%%%%%%";

    if (suffix != "")
        fullPath += "." + suffix;

    fullPath = filesystem::unique_path(fullPath).generic_string();
    relPath = Utils::makeRelative(rootPath, fullPath);

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
    nowide::setenv("R_ENVIRON", "something-which-doesnt-exist", 1);
    nowide::setenv("R_PROFILE", "something-which-doesnt-exist", 1);
    nowide::setenv("R_PROFILE_USER", "something-which-doesnt-exist", 1);
    nowide::setenv("R_ENVIRON_USER", "something-which-doesnt-exist", 1);
    nowide::setenv("R_LIBS_SITE", "something-which-doesnt-exist", 1);
    nowide::setenv("R_LIBS_USER", "something-which-doesnt-exist", 1);

    _rInside = new RInside();

    char *pandoc = nowide::getenv("PANDOCHOME");

    if (pandoc != NULL)
    {
        stringstream ss;
        ss << "Sys.setenv(RSTUDIO_PANDOC='" << pandoc << "')\n";
        _rInside->parseEvalQNT(ss.str());
    }

    setLibPaths("jmv");

    // without this, on macOS, knitr tries to load X11
    _rInside->parseEvalQNT("env <- knitr::knit_global();env$CairoPNG <- grDevices::png\n");

    // change the interaction component separator to an asterisk
    _rInside->parseEvalQNT("sep <- ' \u273B '; base::Encoding(sep) <- 'UTF-8'; options(jmvTermSep=sep); rm(list='sep')\n");

    // calls to methods functions on windows fail without this
    _rInside->parseEvalQNT("suppressPackageStartupMessages(library('methods'))");
}

string EngineR::makeAbsolute(const string &paths)
{
    vector<string> out;
    algorithm::split(out, paths, algorithm::is_any_of(";:"), token_compress_on);

    stringstream result;
    string sep = "";

    filesystem::path here = Dirs::exeDir();

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
