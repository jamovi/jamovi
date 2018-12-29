//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ANALYSIS_H
#define ANALYSIS_H

#include <string>
#include <list>

class Analysis
{
    friend class AnalysisLoader;

public:
    Analysis(
      const std::string &sessionId,
      const std::string &instanceId,
      int analysisId,
      const std::string &name,
      const std::string &ns,
      const std::string &options,
      int revision);

    enum Type { R, Python };

    std::string sessionId;
    std::string instanceId;
    int analysisId;
    std::string name;
    std::string ns;
    int revision;
    std::string options;
    std::string nameAndId;
    int perform;
    std::list<std::string> changed;
    bool clearState;

    bool requiresDataset;

    std::string path;
    std::string format;
    std::string part;

private:
    Type type;
};

#endif // ANALYSIS_H
