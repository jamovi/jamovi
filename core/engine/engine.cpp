//
// Copyright (C) 2016 Jonathon Love
//

#include "engine.h"

#include <iostream>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <chrono>

#include <nanomsg/nn.h>
#include <nanomsg/pair.h>

#include <boost/bind.hpp>

#include "enginer.h"
#include "analysisloader.h"
#include "analysis.h"

#include "silkycoms.pb.h"

using namespace std;
using namespace boost;

Engine::Engine()
{
    _slave = false;
    _exiting = false;
    _waiting = NULL;
    _running = NULL;
    
    _R = new EngineR();
    
    _coms.analysisRequested.connect(bind(&Engine::analysisRequested, this, _1, _2));
    _R->resultsReceived.connect(bind(&Engine::resultsReceived, this, _1));
}

void Engine::setSlave(bool slave)
{
    _slave = slave;
}

void Engine::setConnection(const string &con)
{
    _conString = con;
}

void Engine::setPath(const string &path)
{
    _path = path;
    _R->setPath(path);
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

    thread t(&Engine::messageLoop, this);

    unique_lock<mutex> lock(_mutex);

    while (true)
    {
        while (_waiting == NULL)
            _condition.wait(lock);

        _running = _waiting;
        _waiting = NULL;
        _R->run(_running);
        delete _running;
        _running = NULL;
    }

    t.join();
}

void Engine::analysisRequested(int requestId, Analysis *analysis)
{
    lock_guard<mutex> lock(_mutex);
    _condition.notify_all();
    
    _currentRequestId = requestId;
    _waiting = analysis;
}

void Engine::resultsReceived(const string &results)
{
    silkycoms::ComsMessage message;
    
    message.set_id(_currentRequestId);
    message.set_payload(results);
    message.set_payloadtype("AnalysisResults");
    
    string data;
    
    message.SerializeToString(&data);

    nn_send(_socket, data.data(), data.size(), 0);
}

void Engine::messageLoop()
{
    while (_exiting == false)
    {
        char *buf = NULL;
        int nbytes = nn_recv (_socket, &buf, NN_MSG, 0);

        if (nbytes >= 0)
        {
            _coms.parse(buf, nbytes);
            nn_freemsg(buf);
        }
        else
        {

        }
    }
}
