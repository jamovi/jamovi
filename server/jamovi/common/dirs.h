//
// Copyright (C) 2016 Jonathon Love
//


#ifndef DIRS_H
#define DIRS_H

#include <string>

class Dirs {

public:
    static std::string appDataDir(bool sh0rt=false);
    static std::string tempDir();
    static std::string exePath();
    static std::string exeDir();
    static std::string rHomeDir();
    static std::string documentsDir();
    static std::string downloadsDir();
    static std::string homeDir();
    static std::string desktopDir();

private:
    static std::string _appDataDir;
    static std::string _tempDir;
    static std::string _exePath;
    static std::string _exeDir;
    static std::string _rHomeDir;
    static std::string _documentsDir;
    static std::string _downloadsDir;
    static std::string _homeDir;
    static std::string _desktopDir;

};

#endif // DIRS_H
