//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

#include <sstream>
#include <algorithm>
#include <exception>

#include <boost/filesystem.hpp>
#include <boost/algorithm/string/split.hpp>
#include <boost/algorithm/string/classification.hpp>

#include <boost/nowide/cstdlib.hpp>
#include <boost/nowide/fstream.hpp>
#include <boost/nowide/convert.hpp>

#include "readdf.h"
#include "dirs.h"
#include "utils.h"
#include "jamovi.pb.h"

#ifdef _WIN32
    const char *PATH_SEP = "\\";
    const char PATH_DELIM[] = ";";
#else
    const char *PATH_SEP = "/";
    const char PATH_DELIM[] = ";:";
#endif

using namespace std;
using namespace boost;
using namespace jamovi::coms;

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
        "'" << analysis->instanceId << "', " <<
        analysis->analysisId << ", " <<
        analysis->revision << ")\n";

    rInside.parseEvalQNT(ss.str());

    bool INC_SYNTAX = true;
    bool NO_SYNTAX = false;
    bool COMPLETE = true;
    bool IN_PROGRESS = false;

    if (rInside.parseEvalNT("analysis$errored\n")) {
        sendResults(INC_SYNTAX, COMPLETE);
        return;
    }

    std::function<Rcpp::DataFrame(Rcpp::List)> readDatasetHeader;
    std::function<Rcpp::DataFrame(Rcpp::List)> readDataset;

    readDatasetHeader = std::bind(
        &EngineR::readDataset,
        this,
        analysis->sessionId,
        analysis->instanceId,
        std::placeholders::_1,
        true);
    rInside["readDatasetHeader"] = Rcpp::InternalFunction(readDatasetHeader);
    rInside.parseEvalQNT("analysis$.setReadDatasetHeaderSource(readDatasetHeader)\n");

    readDataset = std::bind(
        &EngineR::readDataset,
        this,
        analysis->sessionId,
        analysis->instanceId,
        std::placeholders::_1,
        false);
    rInside["readDataset"] = Rcpp::InternalFunction(readDataset);
    rInside.parseEvalQNT("analysis$.setReadDatasetSource(readDataset)\n");

    std::function<string()> statePath = std::bind(
        &EngineR::statePath,
        this,
        analysis->sessionId,
        analysis->instanceId,
        analysis->nameAndId);
    rInside["statePath"] = Rcpp::InternalFunction(statePath);
    rInside.parseEvalQNT("analysis$.setStatePathSource(statePath)");

    std::function<Rcpp::List(const string &, const string &)> resourcesPath = std::bind(
        &EngineR::resourcesPath,
        this,
        analysis->sessionId,
        analysis->instanceId,
        analysis->nameAndId,
        std::placeholders::_1,
        std::placeholders::_2);
    rInside["resourcesPath"] = Rcpp::InternalFunction(resourcesPath);
    rInside.parseEvalQNT("analysis$.setResourcesPathSource(resourcesPath)");

    std::function<SEXP(SEXP)> checkpoint = std::bind(
        &EngineR::checkpoint,
        this,
        std::placeholders::_1);
    rInside["checkpoint"] = Rcpp::InternalFunction(checkpoint);
    rInside.parseEvalQNT("analysis$.setCheckpoint(checkpoint)");

    if (analysis->ns == "Rj")
    {
        // Rj needs special access to this
        string datasetPath = _path + PATH_SEP + analysis->sessionId + PATH_SEP + analysis->instanceId + PATH_SEP + "buffer";
        rInside[".datasetPath"] = datasetPath;
    }

    rInside.parseEvalQNT("rm(list=c('optionsPB', 'readDatasetHeader', 'readDataset', 'statePath', 'resourcesPath', 'checkpoint'))\n");

    rInside.parseEvalQNT(".options <- options()"); // save options

    rInside.parseEvalQNT("analysis$init(noThrow=TRUE)");

    if (rInside.parseEvalNT("analysis$errored\n")) {
        sendResults(INC_SYNTAX, COMPLETE);
        rInside.parseEvalQNT("options(.options)"); // restore options
        return;
    }

    if ( ! analysis->clearState)
    {
        Rcpp::CharacterVector changed(analysis->changed.begin(), analysis->changed.end());
        rInside["changed"] = changed;
        rInside.parseEvalQ("try(analysis$.load(changed))");
    }

    rInside.parseEvalQ("analysis$postInit(noThrow=TRUE)");

    if (analysis->perform == 5)  // SAVE
    {
        AnalysisResponse response;
        response.set_instanceid(analysis->instanceId);
        response.set_analysisid(analysis->analysisId);
        response.set_name(analysis->name);
        response.set_ns(analysis->ns);
        response.set_revision(analysis->revision);

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

        if (result == "")
        {
            response.set_status(AnalysisStatus::ANALYSIS_COMPLETE);
        }
        else
        {
            response.mutable_error()->set_message(result);
            response.mutable_error()->set_cause(result);
            response.set_status(AnalysisStatus::ANALYSIS_ERROR);
        }

        response.SerializeToString(&result);

        resultsReceived(result, true);
    }
    else if (rInside.parseEvalNT("analysis$errored || analysis$complete"))
    {
        sendResults(INC_SYNTAX, COMPLETE);
        rInside.parseEvalQ("try(analysis$.save())");
    }
    else if (analysis->perform == 0)   // INIT
    {
        sendResults(NO_SYNTAX, COMPLETE);
        rInside.parseEvalQ("try(analysis$.save())");
    }
    else
    {
        // sendResults(NO_SYNTAX, IN_PROGRESS);

        bool shouldSend = rInside.parseEvalNT("analysis$run(noThrow=TRUE);");
        // shouldn't send if aborted by callback (for example)
        if ( ! shouldSend)
        {
            rInside.parseEvalQNT("options(.options)"); // restore options
            return;
        }

        sendResults(NO_SYNTAX, IN_PROGRESS);
        rInside.parseEvalQNT("analysis$.createImages(noThrow=TRUE);");
        sendResults(NO_SYNTAX, IN_PROGRESS);
        sendResults(INC_SYNTAX, COMPLETE);
        rInside.parseEvalQ("try(analysis$.save())");
    }

    rInside.parseEvalQNT("options(.options)"); // restore options
}

void EngineR::sendResults(bool incAsText, bool complete)
{
    stringstream ss;
    ss << "analysis$serialize(";
    ss << "incAsText=" << (incAsText ? "TRUE" : "FALSE") << ")\n";
    Rcpp::RawVector rawVec = _rInside->parseEval(ss.str());
    string raw(rawVec.begin(), rawVec.end());
    resultsReceived(raw, complete);
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

    algorithm::split(sysR, path, algorithm::is_any_of(PATH_DELIM), token_compress_on);

    cPath = nowide::getenv("JAMOVI_MODULES_PATH");
    if (cPath != NULL)
        path = cPath;

    algorithm::split(moduleR, path, algorithm::is_any_of(PATH_DELIM), token_compress_on);

    ss << "base::.libPaths(c(";

    ss << "'" << Dirs::appDataDir(true) << "/modules/" << moduleName << "/R'";

    for (auto path : moduleR)
    {
        ss << ",'" << makeAbsolute(path) << "/" << moduleName << "/R'";
        ss << ",'" << makeAbsolute(path) << "/base/R'";

        if (moduleName == "Rj")
            ss << ", '" << makeAbsolute(path) << "/jmv/R'";
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
        resultsReceived(raw, false);
    }

    return R_NilValue;
}

Rcpp::DataFrame EngineR::readDataset(
    const string &sessionId,
    const string &instanceId,
    Rcpp::List columnsRequired,
    bool headerOnly)
{
    if (_rInside == NULL)
        initR();

    string path = _path + PATH_SEP + sessionId + PATH_SEP + instanceId + PATH_SEP + "buffer";

    Rcpp::StringVector req(columnsRequired.size());
    int count = 0;
    for (SEXP sexp : columnsRequired)
        req[count++] = Rcpp::as<Rcpp::String>(sexp);

    return readDF(path, req, headerOnly);
}

void EngineR::setCheckForNewCB(std::function<Analysis*()> check)
{
    _checkForNew = check;
}

string EngineR::analysisDirPath(
    const string &sessionId,
    const string &instanceId,
    const string &analysisId)
{
    stringstream ss;
    ss << _path << "/" << sessionId << "/" << instanceId << "/" << analysisId;
    string path = ss.str();

    EngineR::createDirectories(path);

    return path;
}

std::string EngineR::statePath(
    const string &sessionId,
    const string &instanceId,
    const string &analysisId)
{
    return analysisDirPath(sessionId, instanceId, analysisId) + "/analysis";
}

Rcpp::List EngineR::resourcesPath(
    const string &sessionId,
    const string &instanceId,
    const string &analysisId,
    const string &elementId,
    const string &suffix)
{
    string rootPath = _path + "/" + sessionId + "/" + instanceId;
    string relPath = analysisId + "/resources";
    string fullPath = rootPath + "/" + relPath;

    EngineR::createDirectories(fullPath);

    fullPath += filesystem::unique_path("/%%%%%%%%%%%%%%%%").generic_string();

    if (suffix != "")
        fullPath += "." + suffix;

    relPath = Utils::makeRelative(rootPath, fullPath);

    return Rcpp::List::create(
        Rcpp::Named("rootPath") = rootPath,
        Rcpp::Named("relPath") = relPath);
}

void EngineR::createDirectories(const string &path)
{
#ifdef _WIN32
    wstring wpath = nowide::widen(path);
    filesystem::path fpath = filesystem::path(wpath);
#else
    filesystem::path fpath = filesystem::path(path);
#endif

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

#ifdef _WIN32
    // ensure C:\Windows\System32 is on the path
    // necessary for stan, because it invokes the compiler via cmd.exe
    string path;
    char *cPath = nowide::getenv("PATH");
    if (cPath != NULL)
        path = cPath;
    path += ";C:\\Windows\\System32";
    nowide::setenv("PATH", path.c_str(), 1);
#endif

    _rInside = new RInside();

    // set english locale (the arrogance!)
    // fixes some unicode handling issues
#ifdef _WIN32
    _rInside->parseEvalQNT("Sys.setlocale('LC_ALL', 'English_United States.1252')\n");
#else
    _rInside->parseEvalQNT("Sys.setlocale('LC_ALL', 'en_US.UTF-8')\n");
#endif

    char *pandoc = nowide::getenv("PANDOCHOME");

    if (pandoc != NULL)
    {
        stringstream ss;
        ss << "Sys.setenv(RSTUDIO_PANDOC='" << pandoc << "')\n";
        _rInside->parseEvalQNT(ss.str());
    }

    // override .libPaths(), the R version munges international characters
    // and wrecks those short blah~1 type paths
    _rInside->parseEvalQNT(""
        "base <- base::.getNamespace('base')\n"
        "base::unlockBinding('.libPaths', base)\n"
        ".lib.loc <- base$.libPaths()\n"
        "base$.libPaths <- function (new)\n"
        "{\n"
        "    if ( ! missing(new)) {\n"
        "        paths <- c(new, .Library.site, .Library)\n"
        "        paths <- paths[dir.exists(paths)]\n"
        "        .lib.loc <<- unique(paths)\n"
        "    } else .lib.loc\n"
        "}\n"
        "base::lockBinding('.libPaths', base)\n"

        "utils <- base::.getNamespace('utils')\n"
        "base::unlockBinding('install.packages', utils)\n"
        "base::unlockBinding('update.packages', utils)\n"
        "base::unlockBinding('download.packages', utils)\n"
        "base::unlockBinding('remove.packages', utils)\n"

        "utils$install.packages <- function(...)"
        "{\n"
        "    stop('You cannot install packages into the jamovi R', call.=FALSE)\n"
        "}\n"
        "base$install.packages <- function(...)"
        "{\n"
        "    stop('You cannot install packages into the jamovi R', call.=FALSE)\n"
        "}\n"

        "utils$update.packages <- function(...)"
        "{\n"
        "    stop('You cannot update packages in the jamovi R', call.=FALSE)\n"
        "}\n"
        "base$update.packages <- function(...)"
        "{\n"
        "    stop('You cannot update packages in the jamovi R', call.=FALSE)\n"
        "}\n"

        "utils$download.packages <- function(...)"
        "{\n"
        "    stop('You cannot download packages with the jamovi R', call.=FALSE)\n"
        "}\n"
        "base$update.packages <- function(...)"
        "{\n"
        "    stop('You cannot update packages in the jamovi R', call.=FALSE)\n"
        "}\n"

        "utils$remove.packages <- function(...)"
        "{\n"
        "    stop('You cannot remove packages in the jamovi R', call.=FALSE)\n"
        "}\n"
        "base$remove.packages <- function(...)"
        "{\n"
        "    stop('You cannot remove packages in the jamovi R', call.=FALSE)\n"
        "}\n"

        "base::lockBinding('install.packages', utils)\n"
        "base::lockBinding('install.packages', base)\n"
        "base::lockBinding('update.packages', utils)\n"
        "base::lockBinding('update.packages', base)\n"
        "base::lockBinding('download.packages', utils)\n"
        "base::lockBinding('download.packages', base)\n"
        "base::lockBinding('remove.packages', utils)\n"
        "base::lockBinding('remove.packages', base)\n"
    );

    setLibPaths("jmv");

    // without this, on macOS, knitr tries to load X11
    _rInside->parseEvalQNT("env <- knitr::knit_global();env$CairoPNG <- grDevices::png\n");

    // change the interaction component separator to an asterisk
    _rInside->parseEvalQNT("sep <- rawToChar(as.raw(c(0x20, 0xE2, 0x9C, 0xBB, 0x20))); base::Encoding(sep) <- 'UTF-8'; options(jmvTermSep=sep); rm(list='sep')\n");

    // calls to methods functions on windows fail without this
    _rInside->parseEvalQNT("suppressPackageStartupMessages(library('methods'))");

    // preload jmv
    _rInside->parseEvalQNT("suppressPackageStartupMessages(requireNamespace('jmv'))");
}

string EngineR::makeAbsolute(const string &paths)
{
    vector<string> out;
    algorithm::split(out, paths, algorithm::is_any_of(PATH_DELIM), token_compress_on);

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
