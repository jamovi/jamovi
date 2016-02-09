
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
	R_HOME = ../../../../Frameworks/R
	LIBS =	-L../../../lib \
			-L../../../lib/libgcc \
			-L$(R_HOME)/bin/x64 \
			-L$(R_HOME)/library/RInside/lib/x64
endif

INCLUDES += -I../libsilky/silky \
	-I../../../include \
	-I../common \
	-I$(R_HOME)/include \
	-I$(R_HOME)/library/RInside/include \
	-I$(R_HOME)/library/Rcpp/include
	
LIBS += -lR -lnanomsg -lprotobuf -lRInside

SRCS  = $(wildcard *.cpp)
SRCS += $(wildcard **/*.cpp)

OBJS += $(BUILD_DIR)/enginecoms.pb.cc.o
OBJS += $(addprefix $(BUILD_DIR)/,$(SRCS:.cpp=.cpp.o))

$(TARGET): $(OBJS)
	mkdir -p $(@D)
	$(CXX) -o $@ $^ $(CFLAGS) $(LIBS)
	$(INT)

enginecoms.pb.cc: ../../server/enginecoms.proto
	protoc --cpp_out=. --proto_path=../../server ../../server/enginecoms.proto

$(BUILD_DIR)/enginecoms.pb.cc.o: enginecoms.pb.cc
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

$(BUILD_DIR)/%.cpp.o: %.cpp
	mkdir -p $(@D)
	$(CXX) -c -o $@ $^ $(CFLAGS) $(INCLUDES)

clean:
	rm -f $(TARGET) $(OBJS)
