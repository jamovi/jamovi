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
    Analysis(int id, std::string name, std::string ns, std::string options, int ppi);

    enum Type { R, Python };

    int id;
    std::string name;
    std::string ns;
    int ppi;
    std::string options;
    std::string nameAndId;
    int perform;

    bool requiresDataset;
    std::string datasetId;

private:
    Type type;
};

#endif // ANALYSIS_H
