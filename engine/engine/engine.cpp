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

#include "host.h"

#include "enginer.h"
#include "analysis.h"

#include "jamovi.pb.h"

using namespace std;
using namespace boost;
using namespace jamovi::coms;

Engine::Engine()
{
    _slave = false;
    _exiting = false;
    _waiting = NULL;
    _running = NULL;

    _R = new EngineR();

    _coms.analysisRequested.connect(bind(&Engine::analysisRequested, this, _1, _2));
    _coms.restartRequested.connect(bind(&Engine::terminate, this));
    _R->opEventReceived.connect(bind(&Engine::opEventReceived, this, _1));
    _R->resultsReceived.connect(bind(&Engine::resultsReceived, this, _1, _2));
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

    // start the message loop thread
    thread t(&Engine::messageLoop, this);

    // locks for sharing between threads
    unique_lock<mutex> lock(_mutex, std::defer_lock);

    std::function<Analysis*()> checkForNew;
    checkForNew = std::bind(&Engine::waiting, this);
    _R->setCheckForNewCB(checkForNew);

    while (true)
    {
        lock.lock(); // lock to access _waiting

        while (_waiting == NULL)
        {
            // wait for notification from message loop
            cv_status res;
            res = _condition.wait_for(lock, chrono::milliseconds(250));
            periodicChecks();
            if (res == cv_status::timeout)
                continue;
        }

        _running = _waiting;
        _waiting = NULL;

        lock.unlock();

        _R->run(_running);
        delete _running;
        _running = NULL;
    }

    t.join();
}

void Engine::periodicChecks()
{
    // suicide if parent is running
    if (Host::isOrphan())
        terminate();
}

void Engine::terminate()
{
    _exiting = true;
    nn_term();
    std::exit(0);
}

Analysis *Engine::waiting()
{
    // called from the main loop

    lock_guard<mutex> lock(_mutex);
    Analysis *analysis = _waiting;

    return analysis;
}

void Engine::analysisRequested(int requestId, Analysis *analysis)
{
    // this is called from the message loop thread

    lock_guard<mutex> lock(_mutex);
    _condition.notify_all();

    _currentRequestId = requestId;
    _waiting = analysis;
}

void Engine::opEventReceived(const string &msg)
{
    ComsMessage message;

    message.set_id(_currentRequestId);

    if (msg != "") {
        message.mutable_error()->set_message(msg);
        message.mutable_error()->set_cause(msg);
        message.set_status(Status::ERROR);
    }

    string data;
    message.SerializeToString(&data);
    nn_send(_socket, data.data(), data.size(), 0);
}

void Engine::resultsReceived(const string &results, bool complete)
{
    // this is called from the main thread

    ComsMessage message;

    message.set_id(_currentRequestId);
    message.set_payload(results);
    message.set_payloadtype("AnalysisResponse");
    message.set_status(complete ? Status::COMPLETE : Status::IN_PROGRESS);

    string data;
    message.SerializeToString(&data);
    nn_send(_socket, data.data(), data.size(), 0);
}

void Engine::messageLoop()
{
    // message loop runs in its own thread

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
