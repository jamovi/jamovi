//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

#include <boost/filesystem.hpp>

#include "boost/nowide/cstdlib.hpp"
#include "settings.h"
#include "dirs2.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

void EngineR::run(Analysis &analysis)
{
    if (_rInside == NULL)
    {
        string path;
        
        path = Settings::get("R_HOME", "");
        if (path != "")
            nowide::setenv("R_HOME", makeAbsolute(path).c_str(), 1);

        path = Settings::get("R_LIBS", "");
        if (path != "")
            nowide::setenv("R_LIBS", makeAbsolute(path).c_str(), 1);
        
        nowide::setenv("R_ENVIRON", "something-which-doesnt-exist", 1);
        nowide::setenv("R_PROFILE", "something-which-doesnt-exist", 1);
        nowide::setenv("R_PROFILE_USER", "something-which-doesnt-exist", 1);
        nowide::setenv("R_ENVIRON_USER", "something-which-doesnt-exist", 1);
        nowide::setenv("R_LIBS_SITE", "something-which-doesnt-exist", 1);
        nowide::setenv("R_LIBS_USER", "something-which-doesnt-exist", 1);
                
        _rInside = new RInside();
    }

    _rInside->parseEvalQNT("print(1 + 2)");
}

string EngineR::makeAbsolute(const string &p)
{
    filesystem::path path = p;
    
    if (path.is_relative())
    {
        filesystem::path here = Dirs2::exeDir();
        path = here / path;
    }
    
    return path.generic_string();
}
