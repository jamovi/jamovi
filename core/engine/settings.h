//
// Copyright (C) 2016 Jonathon Love
//

#ifndef SETTINGS_H
#define SETTINGS_H

#include <map>
#include <string>
#include <boost/property_tree/ptree.hpp>
#include <boost/property_tree/ini_parser.hpp>
#include <boost/filesystem.hpp>

#include "dirs2.h"

class Settings
{
public:
    static std::string get(const std::string &key, const std::string &defaul);

private:
    static Settings *_settings;
    Settings();
    boost::property_tree::ptree _pt;
};

#endif // SETTINGS_H
