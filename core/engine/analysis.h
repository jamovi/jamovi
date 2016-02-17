//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ANALYSIS_H
#define ANALYSIS_H

#include <string>

class Analysis
{
    friend class AnalysisLoader;
    
public:
    enum Type { R, Python };
    
private:
    Analysis(int id, std::string name, std::string ns);
    int id;
    std::string name;
    std::string ns;
    Type type;
};

#endif // ANALYSIS_H
