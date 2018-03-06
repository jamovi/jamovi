
powershell -Command "(gc Makefile.in) -replace '%%PREFIX%%', '' -replace '%%LIBDIR%%', '' -replace '%%CFLAGS%%', '' -replace '%%CXXFLAGS%%', '' -replace '%%R_PATH%%', '' -replace '%%BASE_MODULE_PATH%%', '' -replace '%%R_HOME%%', '' | Out-File Makefile"
