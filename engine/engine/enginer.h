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

#include "analysis.h"

class EngineR
{
public:
    EngineR();
    void run(Analysis *analysis);
    void setPath(const std::string &path);
    void setCheckForNewCB(std::function<Analysis*()> check);

    boost::signals2::signal<void (const std::string &)> opEventReceived;
    boost::signals2::signal<void (const std::string &, bool complete)> resultsReceived;

private:

    Analysis *_current;

    void initR();
    SEXP checkpoint(SEXP results = R_NilValue);

    std::function<Analysis*()> _checkForNew;

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
