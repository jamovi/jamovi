
FROM jamovi/jamovi-deps:latest as deps

FROM ubuntu:20.04 as intermediate
LABEL stage=intermediate

COPY --from=deps /usr/local /usr/local
COPY --from=deps /tmp/jmv-build /tmp/jmv-build

# dev
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    locales \
    python3 \
    python3-pip \
    nodejs \
    npm \
    libgfortran5 \
    libprotobuf17 \
    protobuf-compiler \
    libcurl3-nss \
    libboost-filesystem-dev \
    libboost-system-dev \
    libprotobuf-dev \
    libnanomsg-dev \
    zlib1g-dev \
    libarchive-zip-perl  # for crc32

# runtime
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y \
    locales \
    python3 \
    python3-pip \
    python3-pkg-resources \
    python3-six \
    libicu66 \
    libgomp1 \
    libgfortran5 \
    libcurl3-nss \
    libpng16-16 \
    libjpeg9 \
    libcairo2

RUN sed -i -e 's/# en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/' /etc/locale.gen && \
    dpkg-reconfigure --frontend=noninteractive locales && \
    update-locale LANG=en_US.UTF-8
ENV LANG en_US.UTF-8

WORKDIR /tmp

# general files
RUN mkdir -p /usr/lib/jamovi
RUN mkdir -p /usr/lib/jamovi/modules
RUN mkdir -p  /usr/lib/jamovi/client
RUN mkdir -p  /usr/lib/jamovi/bin

COPY version           /usr/lib/jamovi
COPY platform/env.conf /usr/lib/jamovi/bin
COPY examples          /usr/lib/jamovi/examples
COPY platform/jamovi   /usr/lib/jamovi/bin
RUN chmod u+x /usr/lib/jamovi/bin/jamovi

COPY platform/build /usr/local/bin/build
RUN chmod u+x /usr/local/bin/build

# server
COPY server /tmp/source/server
RUN build server

COPY readstat /tmp/source/readstat
RUN build readstat

# engine
COPY engine /tmp/source/engine
RUN build engine

# prepare compiler
COPY jamovi-compiler /tmp/source/jamovi-compiler
RUN build compiler

# jmvcore
COPY jmvcore /tmp/source/jmvcore
RUN build jmvcore

# jmv
COPY jmv /tmp/source/jmv
RUN build jmv

# extra modules
# RUN git clone https://github.com/raviselker/scatr.git
# RUN node jamovi-compiler/index.js --install scatr --to /usr/lib/jamovi/modules --rhome /usr/local/lib/R
# RUN git clone https://github.com/raviselker/surveymv.git
# RUN node jamovi-compiler/index.js --install surveymv --to /usr/lib/jamovi/modules --rhome /usr/local/lib/R
# RUN git clone https://github.com/davidfoxcroft/lsj-data.git /usr/lib/jamovi/modules/lsj-data
# RUN git clone https://github.com/jamovi/r-datasets.git /usr/lib/jamovi/modules/r-datasets

# client
COPY client /tmp/source/client
RUN build client release

ENV LD_LIBRARY_PATH /usr/local/lib/R/lib
ENV JAMOVI_HOME /usr/lib/jamovi
ENV PYTHONPATH /usr/lib/jamovi/server
ENV R_LIBS /usr/local/lib/R/library

EXPOSE 41337
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["/usr/bin/python3 -m jamovi.server 41337 --if=*"]
