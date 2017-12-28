#Version: 0.0.1
FROM ubuntu:14.04
MAINTAINER AuThor LMY "lmysoar@hotmail.com"
RUN rm -rf /var/lib/apt/lists/*
RUN sed -i "s/http\:\/\/archive\.ubuntu\.com/http\:\/\/mirrors\.aliyun\.com/g" /etc/apt/sources.list
RUN sed -i "s/http\:\/\/security\.ubuntu\.com/http\:\/\/mirrors\.aliyun\.com/g" /etc/apt/sources.list
RUN apt-get clean
RUN apt-get update
RUN apt-get dist-upgrade
RUN apt-get install --fix-missing -y apt-utils
RUN apt-get install -y build-essential
RUN apt-get install -y python
RUN apt-get clean
RUN apt-get update
RUN apt-get install -y openjdk-7-jdk
RUN apt-get install -y openjdk-7-jre
