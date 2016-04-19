
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

BUILD_DIR = ../../../../build/engine/engine
TARGET = ../../../../bin/engine
	
CFLAGS = -std=c++11 -DUNICODE

ifeq ($(os),OSX)

	R_HOME = ../../../../Frameworks/R.framework/Versions/3.2/Resources
	LIBS =	-L../../../../Frameworks \
			-L../../../lib \
			-L$(R_HOME)/lib \
			-L$(R_HOME)/library/RInside/lib \
			-lboost_filesystem-mt \
			-lboost_system-mt
			
	INT = install_name_tool -change /usr/local/lib/libnanomsg.4.dylib @executable_path/../Frameworks/libnanomsg.4.dylib $(TARGET)
else
ifeq ($(os),Linux)
	R_HOME = /usr/lib/R
	INCLUDES += -I/usr/share/R/include
	LIBS  = -L$(R_HOME)/library/RInside/lib -L$(R_HOME)/site-library/RInside/lib \
			-lboost_filesystem \
			-lboost_system \
			-lpthread \
            -Wl,-R$(R_HOME)/site-library/RInside/lib
else
	R_HOME = ../../../../Frameworks/R
	LIBS =	-L../../../lib \
			-L../../../lib/libgcc \
			-L$(R_HOME)/bin/x64 \
			-L$(R_HOME)/library/RInside/lib/x64 \
			-lboost_filesystem-mgw49-mt-1_60 \
			-lboost_system-mgw49-mt-1_60
endif
endif

INCLUDES += -I../libsilky/silky \
	-I../../../include \
	-I../common \
	-I$(R_HOME)/include \
	-I$(R_HOME)/library/RInside/include -I$(R_HOME)/site-library/RInside/include \
	-I$(R_HOME)/library/Rcpp/include	-I$(R_HOME)/site-library/Rcpp/include
	
LIBS += -lR -lnanomsg -lprotobuf -lRInside

SRCS  = $(wildcard *.cpp)
SRCS += $(wildcard **/*.cpp)
SRCS += $(wildcard ../common/*.cpp)
SRCS += $(wildcard ../common/**/*.cpp)

OBJS += $(BUILD_DIR)/silkycoms.pb.cc.o
OBJS += $(addprefix $(BUILD_DIR)/,$(SRCS:.cpp=.cpp.o))

$(TARGET): $(OBJS)
	mkdir -p $(@D)
	$(CXX) -o $@ $^ $(CFLAGS) $(LIBS)
	$(INT)

silkycoms.pb.cc: ../../server/silkycoms.proto
	protoc --cpp_out=. --proto_path=../../server ../../server/silkycoms.proto

$(BUILD_DIR)/silkycoms.pb.cc.o: silkycoms.pb.cc
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

$(BUILD_DIR)/%.cpp.o: %.cpp
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

clean:
	rm -f $(TARGET) $(OBJS)
