# -*- coding: utf-8 -*-

import sys
from socket import getaddrinfo
from urlparse import urlparse
import views
from bs4 import BeautifulSoup
from requests import get
from .models import hostScan



reload(sys)
sys.setdefaultencoding('utf-8')


class hostinfo(views.info):
    def __init__(self, url):
        views.info.__init__(self)
        self.url = url
        self.scheme = urlparse(self.url).scheme
        self.host = urlparse(self.url).netloc
        self.ip = ''
        self.cdn = True
        self.title = ''
        self.address = ''
        self.get_info()
        self.save_info()

    def get_title(self):
        try:
            souFile = get(self.scheme + "://" + self.host, verify=False, timeout=5)
            if souFile.encoding == 'ISO-8859-1':
                souFile.encoding = 'utf8'
            souFile = souFile.text
            soup = BeautifulSoup(souFile)
            self.title = soup.title.string
        except Exception, e:
            self.title = ''

    def get_ip(self):
        try:
            headers = {
                "Referer": "http://ip.cn/index.php?ip=" + self.host,
                "User-Agent": "ozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:45.0) Gecko/20100101 Firefox/45.0"
            }
            reshtml = get("http://ip.cn/index.php?ip=" + self.host, headers=headers).text
            bp = BeautifulSoup(reshtml)
            info = []
            for str in bp.p.strings:
                info.append(str)
            getaddr = getaddrinfo(self.host, None)[0][4]
            if getaddr[0] == info[1]:
                self.cdn = False
                self.ip = info[1]
                self.address = info[2]
                print self.address
        except Exception, e:
            print e

    def get_info(self):
        self.get_title()
        self.get_ip()

    def save_info(self):
        currentInfo = hostScan(
            hostName=self.scheme + "://" + self.host,
            ip=self.ip,
            title=self.title,
            useCdn=self.cdn,
            address=self.address,
        )
        currentInfo.save()
