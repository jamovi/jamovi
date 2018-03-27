//
// Copyright (C) 2016 Jonathon Love
//

#include "engine.h"

#include <cstdio>
#include <iostream>

#include <stdexcept>

#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#include <boost/nowide/convert.hpp>
#endif

using namespace std;

int main(int argc, char *argv[])
{
#ifdef _WIN32
    // argv doesn't do unicode on windows :/
    LPWSTR *argvw;
    int argcw;
    int i;

    // convenient alternative!
    argvw = CommandLineToArgvW(GetCommandLineW(), &argcw);

    char *new_argv[3];

    for (i = 0; i < 3; i++)
    {
        if (i < argcw)
        {
            std::wstring utf16 = argvw[i];
            // oh f@#! it's UTF-16
            std::string utf8 = boost::nowide::narrow(utf16);
            char *new_arg = (char*)malloc(utf8.size() + 1);
            std::memcpy(new_arg, utf8.c_str(), utf8.size() + 1);
            new_argv[i] = new_arg;
        }
        else
        {
            new_argv[i] = "";
        }
    }
    LocalFree(argvw);

    // an argv useful for a program!
    argv = new_argv;
#endif

    try {

        Engine e;

        char url[512];
        char path[512];

        if (argc == 3)
        {
            int urlc  = sscanf(argv[1], "--con=%511s", url);
            int pathc = sscanf(argv[2], "--path=%511s", path);

            if (urlc == 1 && pathc == 1)
            {
                e.setConnection(string(url));
                // sscanf isn't reliable with unicode chars on windows
                e.setPath(string(&argv[2][7]));
                e.start();
            }
            else
            {
                throw runtime_error("Usage: engine --con=ipc://...  --path=PATH \n");
            }
        }
        else
        {
            throw runtime_error("Usage: engine --con=ipc://... --path=PATH \n");
        }

    }
    catch (const exception &e)
    {
        cerr << e.what();
        return 1;
    }

    return 0;
}
