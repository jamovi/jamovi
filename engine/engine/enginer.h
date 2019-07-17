//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINER_H
#define ENGINER_H

#include <RInside.h>
#include <Rcpp.h>

#undef Free   // #defs left over from R which stuff things up
#undef ERROR

#include <boost/signals2.hpp>

#include <vector>
#include <string>

#include "jamovi.pb.h"


class EngineR
{
public:
    EngineR();
    void run(jamovi::coms::AnalysisRequest &analysis);
    void setPath(const std::string &path);
    void setCheckForAbortCB(std::function<bool()> check);

    boost::signals2::signal<void (const std::string &, bool complete)> resultsReceived;

private:

    jamovi::coms::AnalysisRequest _current;

    void initR();
    SEXP checkpoint(SEXP results = R_NilValue);

    std::function<bool()> _checkForAbort;

    Rcpp::DataFrame readDataset(
        const std::string &sessionId,
        const std::string &instanceId,
        Rcpp::List columns,
        bool headerOnly);

    std::string analysisDirPath(
        const std::string &sessionId,
        const std::string &instanceId,
        const std::string &analysisId);

    std::string statePath(
        const std::string &sessionId,
        const std::string &instanceId,
        const std::string &analysisId);

    Rcpp::List resourcesPath(
        const std::string &sessionId,
        const std::string &instanceId,
        const std::string &analysisId,
        const std::string &elementId,
        const std::string &suffix);

    void sendResults(bool incAsText, bool complete);

    static void createDirectories(const std::string &path);
    static void setLibPaths(const std::string &moduleName);
    static std::string makeAbsolute(const std::string &path);
    static RInside *_rInside;

    std::string _path;
};

#endif // ENGINER_H
