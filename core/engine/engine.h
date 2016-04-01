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

#include <nanomsg/nn.h>
#include <nanomsg/pipeline.h>

#include "enginecoms.h"
#include "enginer.h"
#include "analysis.h"

class Engine
{
public:
	Engine();
	void setSlave(bool slave);
    void setConnection(const std::string &conn);
    void start();
	
private:
    void messageLoop();
    void analysisRequested(int requestId, Analysis *analysis);
    void resultsReceived(const std::string &results);
    
    EngineComs _coms;

    EngineR *_R;
    
    bool _slave;
    std::string _conString;
    int _socket;
    int _conId;
    bool _exiting;
    
    int _currentRequestId;
    
    std::mutex _mutex;
    std::condition_variable _condition;
    
    Analysis *_waiting;
    Analysis *_running;
};

#endif // ENGINE_H
