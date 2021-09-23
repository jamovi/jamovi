//
// Copyright (C) 2016 Jonathon Love
//

#include "engine.h"

#include <iostream>
#include <stdexcept>
#include <thread>
#include <mutex>
#include <chrono>
#include <cstdlib>
#include <cstring>

#include <boost/bind.hpp>

#include "host.h"
#include "enginer.h"
#include "jamovi.pb.h"

using namespace std;
using namespace boost;
using namespace jamovi::coms;

Engine::Engine()
{
    _exiting = false;
    _headless = false;

    char *headless = std::getenv("JAMOVI_ENGINE_HEADLESS");
    if (headless != NULL && strcmp(headless, "1") == 0)
        _headless = true;

    _reflection = _runningRequest.GetReflection();

    _coms = NULL;
    _R = new EngineR();
    _R->resultsReceived.connect(bind(&Engine::resultsReceived, this, _1, _2));
}

void Engine::setConnection(const string &con)
{
    _connPath = con;
}

void Engine::setPath(const string &path)
{
    _path = path;
    _R->setPath(path);
}

void Engine::start()
{

#ifdef JAMOVI_ENGINE_SUPPORT_LOCAL_SOCKETS
    if (_connPath.rfind("ipc://", 0) == 0)
        _coms = new ComsNN(); // nanomsg
    else
        _coms = new ComsDS();  // domain sockets
#else
    _coms = new ComsNN();
#endif

    _coms->connect(_connPath);

    // start the message loop thread
    thread t(&Engine::messageLoop, this);

#ifndef _WIN32
    // this monitors the stdin, and ends the process when the stdin closes
    // i.e. when the server ends. this is just one of several mechanisms we
    // use to end the engine processes when the server finishes.
    // semPlot won't run correctly with this thread running, on windows
    // hence the #ifndef ... who knows why.
    thread u;
    if ( ! _headless)
        u = thread(&Engine::monitorStdinLoop, this);
#endif

    // locks for sharing between threads
    unique_lock<mutex> lock(_mutex, std::defer_lock);

    std::function<bool()> checkForAbort;
    checkForAbort = std::bind(&Engine::isNewAnalysisWaiting, this);
    _R->setCheckForAbortCB(checkForAbort);

    while (true)
    {
        lock.lock(); // lock to access _waitingRequest

        while (_waitingRequest.analysisid() == 0)
        {
            // wait for notification from message loop
            cv_status res;
            res = _condition.wait_for(lock, chrono::milliseconds(250));
            if ( ! _headless)
                periodicChecks();
            if (res == cv_status::timeout)
                continue;
        }

        _runningRequest.Clear();
        _reflection->Swap(&_runningRequest, &_waitingRequest);

        lock.unlock();

        _R->run(_runningRequest);
        _runningRequest.Clear();
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
    _coms->close();
    std::exit(0);
}

bool Engine::isNewAnalysisWaiting()
{
    // called from the main loop
    lock_guard<mutex> lock(_mutex);
    return _waitingRequest.analysisid() != 0;
}

void Engine::resultsReceived(const string &results, bool complete)
{
    _coms->send(results, complete);
}

void Engine::messageLoop()
{
    // message loop runs in its own thread

    while (_exiting == false)
    {
        AnalysisRequest request = _coms->read();

        if (request.restartengines())
        {
            terminate();
        }
        else
        {
            lock_guard<mutex> lock(_mutex);
            _condition.notify_all();
            _waitingRequest.CopyFrom(request);
        }
    }
}

void Engine::monitorStdinLoop()
{
    string temp;
    while (true)
    {
        getline(cin, temp);
        if (cin.eof())
            break;
    }
    terminate();
}
