
#ifndef EXCEPTIONS_H
#define EXCEPTIONS_H

#include <exception>

class NoConnectionException: public std::exception { };
class UnableToConnectException: public NoConnectionException { };
class ConnectionLostException: public NoConnectionException { };

#endif // EXCEPTIONS_H
