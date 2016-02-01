
#include "utilites.h"

unsigned long utils_currentPID()
{
#ifdef _WIN32
	return GetCurrentProcessId();
#else
	return getpid();
#endif
}

unsigned long utils_parentPID()
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

int utils_isParentAlive()
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
}