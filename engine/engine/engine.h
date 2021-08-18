//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINE_H
#define ENGINE_H

#include "engine.h"

#include <string>
#include <thread>
#include <mutex>
#include <condition_variable>

#include "coms.h"
#include "enginer.h"

class Engine
{
public:
    Engine();
    void setConnection(const std::string &conn);
    void setPath(const std::string &path);
    void start();

private:
    void messageLoop();
    void monitorStdinLoop();
    void resultsReceived(const std::string &results, bool complete);
    void periodicChecks();
    void terminate();
    bool isNewAnalysisWaiting();

    Coms *_coms;
    EngineR *_R;

    std::string _connPath;
    std::string _path;
    bool _exiting;
    bool _headless;

    jamovi::coms::AnalysisRequest _waitingRequest;
    jamovi::coms::AnalysisRequest _runningRequest;
    const google::protobuf::Reflection *_reflection;

    std::mutex _mutex;
    std::condition_variable _condition;
};

#endif // ENGINE_H
