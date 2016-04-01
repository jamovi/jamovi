//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINER_H
#define ENGINER_H

#include <RInside.h>
#include <Rcpp.h>
#include <boost/signals2.hpp>

#undef Free
#undef ERROR

#include "analysis.h"

class EngineR
{
public:
    void run(Analysis *analysis);
    
    boost::signals2::signal<void (const std::string &)> resultsReceived;
    
private:
    static std::string makeAbsolute(const std::string &path);
    static RInside *_rInside;
};

#endif // ENGINER_H
