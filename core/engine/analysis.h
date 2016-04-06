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
    
    int id;
    std::string name;
    std::string ns;
    std::string options;

    bool requiresDataset;
    std::string datasetId;
    
private:
    Analysis(int id, std::string name, std::string ns, std::string options);
    Type type;
};

#endif // ANALYSIS_H
