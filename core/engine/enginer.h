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
    
    boost::signals2::signal<void (const std::string &)> resultsReceived;
    
private:

    void initR();
    Rcpp::DataFrame readDataset(const std::string &datasetId, const std::vector<std::string> &columns);
    Rcpp::CharacterVector statePath(const std::string &datasetId, int analysisId);

    static std::string makeAbsolute(const std::string &path);
    static RInside *_rInside;
};

#endif // ENGINER_H
