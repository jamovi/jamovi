//
// Copyright (C) 2016 Jonathon Love
//

#include "engine.h"

#include <iostream>
#include <stdexcept>
#include <thread>
#include <chrono>

#include <nanomsg/nn.h>
#include <nanomsg/pair.h>

#include "enginer.h"
#include "enginecoms.pb.h"
#include "analysisloader.h"
#include "analysis.h"

using namespace std;

Engine::Engine()
{
    _slave = false;
    _exiting = false;
    
    _R = new EngineR();
    
    Analysis *a = AnalysisLoader::create(0, "descriptives", "base");
    
    _R->run(*a);
}

void Engine::setSlave(bool slave)
{
    _slave = slave;
}

void Engine::setConnection(const string &con)
{
    _conString = con;
}

void Engine::start()
{
    _socket = nn_socket(AF_SP, NN_PAIR);
    if (_socket < 0)
        throw runtime_error("Unable to connect : could not create socket");

    int timeout;

    timeout = 1500;
    nn_setsockopt(_socket, NN_SOL_SOCKET, NN_SNDTIMEO, &timeout, sizeof(timeout));

    timeout = 500;
    nn_setsockopt(_socket, NN_SOL_SOCKET, NN_RCVTIMEO, &timeout, sizeof(timeout));

    _conId = nn_connect(_socket, _conString.c_str());
    if (_conId < 0)
        throw runtime_error("Unable to connect : could not connect to endpoint");
    
    char *message = "Mes3sage from engine";
    nn_send(_socket, message, 20, 0);

    thread t(&Engine::messageLoop, this);
    this_thread::sleep_for(chrono::milliseconds(3000));
    //_exiting = true;
    t.join();
}

void Engine::messageLoop()
{
    while (_exiting == false)
    {
        char *buf = NULL;
        int nbytes = nn_recv (_socket, &buf, NN_MSG, 0);

        if (nbytes < 0)
        {

        }
        else
        {
            nn_freemsg (buf);
        }
    }
}
