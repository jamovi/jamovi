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
    void run(Analysis *analysis);
    void setPath(const std::string &path);

    boost::signals2::signal<void (const std::string &)> resultsReceived;

private:

    void initR();
    Rcpp::DataFrame readDataset(const std::string &datasetId, Rcpp::List columns, bool headerOnly);
    std::string analysisDirPath(const std::string &datasetId, const std::string &analysisId);
    std::string statePath(const std::string &datasetId, const std::string &analysisId);
    Rcpp::List resourcesPath(const std::string &datasetId, const std::string &analysisId, const std::string &elementId, const std::string &suffix);

    static void createDirectories(const std::string &path);
    static std::string makeAbsolute(const std::string &path);
    static RInside *_rInside;

    std::string _path;
};

#endif // ENGINER_H
