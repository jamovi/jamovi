
# This Makefile would like Make 2.8 or above

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
CFLAGS = -std=c++11
INCLUDES += -I.

ifeq ($(os),OSX)

	R_HOME = $(SRCDIR)/../../../Frameworks/R.framework/Versions/3.3/Resources
	LIBS =	-L$(SRCDIR)/../../../Frameworks \
			-L$(SRCDIR)/../../lib \
			-L$(R_HOME)/lib \
			-L$(R_HOME)/library/RInside/lib \
			-lboost_filesystem-mt \
			-lboost_system-mt \
			-framework Foundation

else
ifeq ($(os),Linux)
	R_HOME = $(SRCDIR)/../../../lib/R
	LIBS  = -L$(R_HOME)/lib \
			-L$(SRCDIR)/../../modules/base/R/RInside/lib \
			-lboost_filesystem \
			-lboost_system \
			-lpthread \
			-Wl,-rpath,'$$ORIGIN/../lib' \
			-Wl,-rpath,'$$ORIGIN/../Resources/modules/base/R/RInside/lib'
else
	R_HOME = $(SRCDIR)/../../../Frameworks/R
	LIBS =	-L$(SRCDIR)/../../lib \
			-L$(SRCDIR)/../../lib/libgcc \
			-L$(R_HOME)/bin/x64 \
			-L$(R_HOME)/library/RInside/lib/x64 \
			-lboost_filesystem-mgw49-mt-1_60 \
			-lboost_system-mgw49-mt-1_60

	# _WIN32_WINNT is for SHGetKnownFolderPath

	CFLAGS +=	-DUNICODE \
				"-D_WIN32_WINNT=_WIN32_WINNT_VISTA" \
				"-DWIN32_LEAN_AND_MEAN"
endif
endif

INCLUDES += \
	-I$(SRCDIR)/../../include \
	-I$(SRCDIR)/../../../include \
	-I$(SRCDIR)/../server/jamovi/common \
	-I$(R_HOME)/include \
	-I$(SRCDIR)/../../modules/base/R/RInside/include \
	-I$(SRCDIR)/../../modules/base/R/Rcpp/include \
	-I$(R_HOME)/library/RInside/include \
	-I$(R_HOME)/library/Rcpp/include

LIBS += -lR -lnanomsg -lprotobuf -lRInside

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
	mkdir -p $(@D)
	$(CXX) -o $@ $^ $(CFLAGS) $(LIBS)

jamovi.pb.cc: $(SRCDIR)/../server/jamovi/server/jamovi.proto
	protoc --cpp_out=. --proto_path=$(SRCDIR)/../server/jamovi/server $(SRCDIR)/../server/jamovi/server/jamovi.proto

jamovi.pb.cc.o: jamovi.pb.cc
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

../server/jamovi/common/%.cpp.o: $(SRCDIR)/../server/jamovi/common/%.cpp
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

../server/jamovi/common/%.m.o: $(SRCDIR)/../server/jamovi/common/%.m
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(INCLUDES)

engine/%.cpp.o: $(SRCDIR)/engine/%.cpp
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

all: $(TARGET)

clean:
	rm -f $(TARGET) $(OBJS) jamovi.pb.cc jamovi.pc.h

install:
	mkdir -p $(DESTDIR)/bin
	cp $(TARGET) $(DESTDIR)/bin

.PHONY:	clean all install
