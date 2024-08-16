
# This Makefile would like Make 2.8 or above

PREFIX=
LIBDIR=
CFLAGS=
CXXFLAGS=

ifneq (,)
R_PATH=
endif

ifneq (C:/Program\ Files/jamovi/Resources/modules/base/R,)
BASE_MODULE_PATH=C:/Program\ Files/jamovi/Resources/modules/base/R
endif

ifneq (C:/Program\ Files/jamovi/Frameworks/R,)
R_HOME=C:/Program\ Files/jamovi/Frameworks/R
endif

ifeq ($(OS),Windows_NT)
	os = Windows
else
	UNAME_S := $(shell uname -s)
	ifeq ($(UNAME_S),Linux)
		os = Linux
	endif
	ifeq ($(UNAME_S),Darwin)
		os = OSX
	endif
endif

ifeq ($(os),OSX)
	CXX = clang++
endif

SRCDIR ?= $(dir $(firstword $(MAKEFILE_LIST)))
TARGET = jamovi-engine
CXXFLAGS += -std=c++17
INCLUDES += -I.

ifeq ($(os),OSX)
	BINDIR ?= MacOS
	R_HOME ?= $(SRCDIR)/../../../Frameworks/R.framework/Versions/Current/Resources
	BASE_MODULE_PATH ?= $(SRCDIR)/../../modules/base/R
	LDFLAGS +=	-L$(SRCDIR)/../../../Frameworks \
				-L$(R_HOME)/lib \
				-L$(BASE_MODULE_PATH)/RInside/lib \
				-L/usr/local/lib \
				-lboost_filesystem \
				-lboost_system \
				-framework Foundation
	MFLAGS = -mmacosx-version-min=10.13
	CXXFLAGS += $(MFLAGS)
else
ifeq ($(os),Linux)
	BINDIR ?= bin
	R_HOME ?= $(SRCDIR)/../../../lib/R
	BASE_MODULE_PATH ?= $(SRCDIR)/../../modules/base/R
	R_PATH ?= $$ORIGIN/../lib  $$ORIGIN/../Resources/modules/base/R/RInside/lib
	LDFLAGS +=	-L$(R_HOME)/lib \
				-L$(BASE_MODULE_PATH)/RInside/lib \
				-lboost_filesystem \
				-lboost_system \
				-lpthread \
				$(foreach rp,$(R_PATH),-Wl,-rpath,'$(rp)')
else
	BINDIR ?= bin
	R_HOME ?= $(SRCDIR)/../../../Frameworks/R
	BASE_MODULE_PATH ?= $(SRCDIR)/../../modules/base/R
	LDFLAGS +=	-L$(R_HOME)/bin/x64 \
				-L$(BASE_MODULE_PATH)/RInside/lib/x64 \
				-LC:/rtools44/x86_64-w64-mingw32.static.posix/lib \
				-LC:/nanomsg/lib \
				-lboost_filesystem-mt-x64 \
				-lboost_system-mt-x64 \
				-lboost_nowide-mt-x64 \
				-lbcrypt \
				-lprotobuf -labsl_log_internal_check_op -labsl_leak_check -labsl_die_if_null -labsl_log_internal_conditions -labsl_log_internal_message -labsl_examine_stack -labsl_log_internal_format -labsl_log_internal_proto -labsl_log_internal_nullguard -labsl_log_internal_log_sink_set -labsl_log_sink -labsl_log_entry -labsl_flags_internal -labsl_flags_marshalling -labsl_flags_reflection -labsl_flags_private_handle_accessor -labsl_flags_commandlineflag -labsl_flags_commandlineflag_internal -labsl_flags_config -labsl_flags_program_name -labsl_log_initialize -labsl_log_globals -labsl_vlog_config_internal -labsl_log_internal_fnmatch -labsl_log_internal_globals -labsl_raw_hash_set -labsl_hash -labsl_city -labsl_low_level_hash -labsl_hashtablez_sampler -labsl_statusor -labsl_status -labsl_cord -labsl_cordz_info -labsl_cord_internal -labsl_cordz_functions -labsl_exponential_biased -labsl_cordz_handle -labsl_crc_cord_state -labsl_crc32c -labsl_crc_internal -labsl_crc_cpu_detect -labsl_bad_optional_access -labsl_strerror -labsl_str_format_internal -labsl_synchronization -labsl_graphcycles_internal -labsl_kernel_timeout_internal -labsl_stacktrace -labsl_symbolize -ldbghelp -labsl_debugging_internal -labsl_demangle_internal -labsl_malloc_internal -labsl_time -labsl_civil_time -labsl_time_zone -labsl_bad_variant_access -lutf8_validity -lutf8_range -labsl_strings -labsl_strings_internal -labsl_string_view -labsl_base -ladvapi32 -labsl_spinlock_wait -labsl_int128 -labsl_throw_delegate -labsl_raw_logging_internal -labsl_log_severity


	# _WIN32_WINNT is for SHGetKnownFolderPath

	CXXFLAGS +=	-DUNICODE \
				"-D_WIN32_WINNT=_WIN32_WINNT_VISTA" \
				"-DWIN32_LEAN_AND_MEAN" \
				"-fpermissive"
endif
endif

INCLUDES += \
	-I$(SRCDIR)/../../include \
	-I$(SRCDIR)/../../../include \
	-I$(SRCDIR)/../server/jamovi/common \
	-I$(R_HOME)/include \
	-I$(BASE_MODULE_PATH)/RInside/include \
	-I$(BASE_MODULE_PATH)/Rcpp/include \
	-I/usr/share/R/include \
	-IC:/nanomsg/include

LDFLAGS += -lR -lnanomsg -lprotobuf -lRInside

ABS_SRCS  = $(wildcard $(SRCDIR)/engine/*.cpp)
ABS_SRCS += $(wildcard $(SRCDIR)/engine/**/*.cpp)
ABS_SRCS += $(wildcard $(SRCDIR)/../server/jamovi/common/*.cpp)
ABS_SRCS += $(wildcard $(SRCDIR)/../server/jamovi/common/**/*.cpp)
SRCS  = $(subst $(SRCDIR)/,,$(ABS_SRCS))

OBJS += jamovi.pb.cc.o
OBJS += $(SRCS:.cpp=.cpp.o)

ifeq ($(os),OSX)
	ABS_M_SRCS  = $(wildcard $(SRCDIR)/../server/jamovi/common/*.m)
	ABS_M_SRCS += $(wildcard $(SRCDIR)/../server/jamovi/common/**/*.m)
	M_SRCS = $(subst $(SRCDIR)/,,$(ABS_M_SRCS))
	OBJS += $(M_SRCS:.m=.m.o)
endif

$(TARGET): $(OBJS)
	$(CXX) -o $@ $^ $(CXXFLAGS) $(LDFLAGS)

jamovi.pb.cc: $(SRCDIR)/../server/jamovi/server/jamovi.proto
	protoc --cpp_out=. --proto_path=$(SRCDIR)/../server/jamovi/server $(SRCDIR)/../server/jamovi/server/jamovi.proto

jamovi.pb.cc.o: jamovi.pb.cc
	$(CXX) -c -o $@ $^ $(CXXFLAGS) $(INCLUDES)

../server/jamovi/common/%.cpp.o: $(SRCDIR)/../server/jamovi/common/%.cpp
	$(CXX) -c -o $@ $^ $(CXXFLAGS) $(INCLUDES)

../server/jamovi/common/%.m.o: $(SRCDIR)/../server/jamovi/common/%.m
	$(CXX) -c -o $@ $^ $(MFLAGS) $(INCLUDES)

engine/%.cpp.o: $(SRCDIR)/engine/%.cpp
	$(CXX) -c -o $@ $^ $(CXXFLAGS) $(INCLUDES)

all: $(TARGET)

clean:
	rm -f $(TARGET) $(OBJS) jamovi.pb.cc jamovi.pc.h

install:
	cp $(TARGET) $(DESTDIR)$(PREFIX)/$(BINDIR)

.PHONY:	clean all install
