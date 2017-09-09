
#ifndef MACDIRS_H
#define MACDIRS_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

char *macdirs_homeDir();
char *macdirs_documentsDir();
char *macdirs_downloadsDir();
char *macdirs_desktopDir();
char *macdirs_appSupportDir();

#ifdef __cplusplus
}
#endif

#endif // MACDIRS_H
