//
// Copyright (C) 2016 Jonathon Love
//


#ifndef DIRS2_H
#define DIRS2_H

#include <string>

class Dirs2 {

public:
	static std::string appDataDir();
	static std::string tempDir();
	static std::string exeDir();
	static std::string rHomeDir();
	static std::string libraryDir();
	static std::string documentsDir();
	static std::string homeDir();
	static std::string desktopDir();
	
private:
	static std::string _appDataDir;
	static std::string _tempDir;
	static std::string _exeDir;
	static std::string _rHomeDir;
	static std::string _libraryDir;
	static std::string _documentsDir;
	static std::string _homeDir;
	static std::string _desktopDir;
	
};

#endif // DIRS2_H