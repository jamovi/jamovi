//
// Copyright (C) 2016 Jonathon Love
//

#ifndef ENGINE_H
#define ENGINE_H

#include "engine.h"

#include <string>
#include <thread>

#include <nanomsg/nn.h>
#include <nanomsg/pipeline.h>

#include "enginer.h"

class Engine
{
public:
	Engine();
	void setSlave(bool slave);
    void setConnection(const std::string &conn);
    void start();
	
private:
    void messageLoop();

    EngineR *_R;
    
    bool _slave;
    std::string _conString;
    int _socket;
    int _conId;
    bool _exiting;
};

#endif // ENGINE_H
