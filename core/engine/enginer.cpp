//
// Copyright (C) 2016 Jonathon Love
//

#include "enginer.h"

#include <sstream>
#include <boost/filesystem.hpp>
#include <boost/algorithm/string/split.hpp>
#include <boost/algorithm/string/classification.hpp>

#include "boost/nowide/cstdlib.hpp"
#include "settings.h"
#include "dirs2.h"

using namespace std;
using namespace boost;

RInside *EngineR::_rInside = NULL;

void EngineR::run(Analysis *analysis)
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

    stringstream ss;
    
    ss << "print(" << analysis->ns << "::" << analysis->name << "(silkyR::Options('" << analysis->options << "')))";
    
    // std::cout << ss.str();
    // std::cout.flush();

    _rInside->parseEvalQNT(ss.str());
}

string EngineR::makeAbsolute(const string &paths)
{
    vector<string> out;
    algorithm::split(out, paths, algorithm::is_any_of(";:"), token_compress_on);
    
    stringstream result;
    string sep = "";
    
    filesystem::path here = Dirs2::exeDir();

    for (string &p : out)
    {
        system::error_code ec;
        filesystem::path path = p;
        path = canonical(path, here, ec);
        
        result << sep << path.generic_string();
        
#ifdef _WIN32
        sep = ";";
#else
        sep = ":";
#endif
    }
    
    return result.str();
}
