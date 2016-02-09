
#include "utils2.h"

#ifdef _WIN32
#include <windows.h>
#include <tlhelp32.h>
#else
#include "unistd.h"
#endif

unsigned long Utils2::currentPID()
{
#ifdef _WIN32
	return GetCurrentProcessId();
#else
	return getpid();
#endif
}

unsigned long Utils2::parentPID()
{
#ifdef _WIN32
	HANDLE h = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
	PROCESSENTRY32 pe = { 0 };
	pe.dwSize = sizeof(PROCESSENTRY32);

    unsigned long pid = currentPID();
	unsigned long ppid = 0;

	if (Process32First(h, &pe))
	{
		do
		{
			if (pe.th32ProcessID == pid)
			{
				ppid = pe.th32ParentProcessID;
				break;
			}
			
		} while( Process32Next(h, &pe));
	}

	CloseHandle(h);

	return ppid;

#else

	return getppid();

#endif
}

bool Utils2::isParentAlive()
{
#ifdef _WIN32

    static unsigned long ppid = parentPID();
	static void* handle = NULL;

	if (handle == NULL && ppid != 0)
		handle = OpenProcess(PROCESS_QUERY_INFORMATION, FALSE, ppid);

	if (handle != NULL)
	{
		BOOL ok;
		DWORD exit;

		ok = GetExitCodeProcess(handle, &exit);

		return ( ! ok) || exit == STILL_ACTIVE;
	}
	
	return FALSE;
	
#else

	return getppid() != 1;
	
#endif
}