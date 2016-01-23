//
// Copyright (C) 2016 Jonathon Love
//

#include "dirs2.h"

#ifdef _WIN32
#include <windows.h>
#include <shlobj.h>
#include <shlwapi.h>
#elif defined(__APPLE__)
#include <pwd.h>
#include <CoreServices/CoreServices.h>
#else

#endif

#include <boost/filesystem.hpp>
#include <boost/system/error_code.hpp>
#include <boost/nowide/convert.hpp>

#include "appinfo.h"

using namespace std;
using namespace boost;

string Dirs2::_appDataDir = "";
string Dirs2::_tempDir = "";
string Dirs2::_exeDir = "";
string Dirs2::_rHomeDir = "";
string Dirs2::_libraryDir = "";
string Dirs2::_documentsDir = "";
string Dirs2::_homeDir = "";
string Dirs2::_desktopDir = "";

string Dirs2::appDataDir()
{
	if (Dirs2::_appDataDir == "")
	{
		string dir;
		filesystem::path path;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_APPDATA, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
            "Could not retrieve app data directory";

		dir = nowide::narrow(buffer);
		dir += "/" + AppInfo::name + "/" + AppInfo::getShortDesc();

		path = nowide::widen(dir);

#elif defined(__APPLE__)

        path = dir = homeDir() + "/Library/Application Support/" + AppInfo::name + "/" + AppInfo::getShortDesc();

#else

		path = dir = homeDir() + "/." + AppInfo::name + "/" + AppInfo::getShortDesc();

#endif

		if ( ! filesystem::exists(path))
		{
			system::error_code ec;

			filesystem::create_directories(path, ec);

			if (ec)
                throw "could not create app data dir";
		}

		Dirs2::_appDataDir = filesystem::path(dir).generic_string();
	}

	return Dirs2::_appDataDir;
}

string Dirs2::tempDir()
{
	if (Dirs2::_tempDir == "")
	{
		string dir;
		filesystem::path path;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_APPDATA, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
            "Could not retrieve app data directory";

		dir = nowide::narrow(buffer);
		dir += "/" + AppInfo::name + "/temp";

		path = nowide::widen(dir);

#elif defined(__APPLE__)

        path = dir = homeDir() + "/Library/Application Support/" + AppInfo::name + "/temp";

#else

		path = dir = homeDir() + "/." + AppInfo::name + "/temp";

#endif

		if ( ! filesystem::exists(path))
		{
			system::error_code ec;

			filesystem::create_directories(path, ec);

			if (ec)
                throw "could not create app data dir";
		}

		Dirs2::_tempDir = filesystem::path(dir).generic_string();
	}

	return Dirs2::_tempDir;
}

string Dirs2::exeDir()
{
    // TODO
    return "";
}

string Dirs2::rHomeDir()
{
    // TODO
    return "";
}

string Dirs2::libraryDir()
{
    // TODO
    return "";
}

string Dirs2::documentsDir()
{
	if (Dirs2::_documentsDir == "")
	{

		string dir;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_PERSONAL, NULL, SHGFP_TYPE_CURRENT, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve documents directory";
		
		dir = nowide::narrow(buffer);
		
#else

		dir = homeDir() + "/Documents";
		
#endif

		Dirs2::_documentsDir = filesystem::path(dir).generic_string();
	}
	
	return Dirs2::_documentsDir;
}

string Dirs2::homeDir()
{
	if (Dirs2::_homeDir == "")
	{
		string dir;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_PROFILE, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve home directory";
		
		dir = nowide::narrow(buffer);
		
#else

		dir = string(getpwuid(getuid())->pw_dir);
		
#endif

		Dirs2::_homeDir = filesystem::path(dir).generic_string();
	}
	
	return Dirs2::_homeDir;
}

string Dirs2::desktopDir()
{
	if (Dirs2::_desktopDir == "")
	{

		string dir;

#ifdef _WIN32

		TCHAR buffer[MAX_PATH];

		HRESULT ret = SHGetFolderPath(NULL, CSIDL_DESKTOP, NULL, 0, buffer);

		if ( ! SUCCEEDED(ret))
		    throw "Could not retrieve desktop";
		
		dir = nowide::narrow(buffer);
		
#else

		dir = string(getpwuid(getuid())->pw_dir) + "/Desktop";
		
#endif

		Dirs2::_desktopDir = filesystem::path(dir).generic_string();
	}
	
	return Dirs2::_desktopDir;
}
