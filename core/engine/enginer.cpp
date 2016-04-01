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
        
        // calls to methods functions on windows fail without this
        _rInside->parseEvalQNT("suppressPackageStartupMessages(library('methods'))");
    }

    stringstream ss;
    
    ss << "{\n";
    ss << "  options <- silkyR::Options('" << analysis->options << "')\n";
    ss << "  analysis <- " << analysis->ns << "::" << analysis->name << "(id=" << analysis->id << ", options=options)\n";
    ss << "  silkyR::initProtoBuf()\n";
    ss << "  serial <- RProtoBuf::serialize(analysis$asProtoBuf(), NULL)\n";
    ss << "  print(serial)\n";
    ss << "  serial\n";
    ss << "}\n";
    
    // std::cout << ss.str();
    // std::cout.flush();

    Rcpp::RawVector rawVec = _rInside->parseEvalNT(ss.str());
    std::string raw(rawVec.begin(), rawVec.end());
    resultsReceived(raw);
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
