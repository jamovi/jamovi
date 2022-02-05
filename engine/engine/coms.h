//
// Copyright (C) 2016 Jonathon Love
//

#ifndef COMS_H
#define COMS_H

#include <string>

#include "jamovi.pb.h"

class Coms
{
public:
    Coms() { GOOGLE_PROTOBUF_VERIFY_VERSION; }
    virtual void connect(const std::string &path) = 0;
    virtual jamovi::coms::AnalysisRequest read() = 0;
    virtual void send(const std::string &results, bool complete) = 0;
    virtual void close() = 0;

protected:
    jamovi::coms::AnalysisRequest parse(char* buffer, size_t nbytes);
    void stringify(const std::string &results, bool complete, std::string &dest);
};

class ComsNN: public Coms
{
public:
    void connect(const std::string &path);
    jamovi::coms::AnalysisRequest read();
    void send(const std::string &results, bool complete);
    void close();

private:
    int _socket;
    int _connId;
};

#ifdef JAMOVI_ENGINE_SUPPORT_LOCAL_SOCKETS
#include <boost/asio.hpp>

class ComsDS: public Coms
{
public:
    void connect(const std::string &path);
    jamovi::coms::AnalysisRequest read();
    void send(const std::string &results, bool complete);
    void close();

private:
    boost::asio::local::stream_protocol::endpoint _ep;
    boost::asio::local::stream_protocol::iostream _stream;
    char _buffer[4 * 1024 * 1024];
};
#endif

#endif // COMS_H
