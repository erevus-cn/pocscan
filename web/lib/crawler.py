#coding=utf-8
import re
import requests as req
import urlparse
import hashlib
import urllib2


class MyCrawler:

    def __init__(self, target, cookie ,ua):
        #使用种子初始化url队列
        self.linkQuence = linkQuence()
        self.linkQuence.addUnvisitedUrl(target)

        self.cookie = cookie
        self.headers = {
            'User-Agent': ua ,
            'Accept-Encoding': "gzip, deflate, sdch",
            'Cookie': self.cookie
        }
        self.opener = urllib2.build_opener()
        self.opener.addheaders.append(('Cookie', self.cookie))


    #抓取过程主函数
    def crawling(self, target, crawl_count):
        #循环条件：待抓取的链接不空且专区的网页不多于crawl_count
        while self.linkQuence.unVisitedUrlsEnmpy() is False and self.linkQuence.getVisitedUrlCount() <= crawl_count:
            #队头url出队列
            visitUrl = self.linkQuence.unVisitedUrlDeQuence()
            if visitUrl is None or visitUrl == "":
                continue
            # 获取超链接
            links = self.getHyperLinks(visitUrl)
            #将url放入已访问的url中
            self.linkQuence.addVisitedUrl(visitUrl)
            host = urlparse.urlparse(visitUrl).netloc
            #未访问的url入列
            for link in links:
                try:
                    if not urlparse.urlparse(link).netloc :
                        link = "http://"+host+'/'+link
                    if host in link and self.opener.open(link, timeout=0.5).code==200:
                        self.linkQuence.addUnvisitedUrl(link)
                except Exception, e:
                    print e

    #获取源码中得超链接
    def getHyperLinks(self, url):
        # print req.get("http://passport.bilibili.com/site", headers=self.headers).ok
        try:
            links = []
            content = self.opener.open(url, timeout=2).read()
            host  = urlparse.urlparse(url).netloc
            links = re.findall(r"(?<=href=\").+?(?=\")|(?<=href=\').+?(?=\')", content)
            for link in links:
                if not urlparse.urlparse(link).netloc :
                    link = "http://"+host+'/'+link
                    links.append(link)
            return links
        except Exception,e:
            print str(e)
            return [str(e),None]


class linkQuence:
    def __init__(self):
        #已访问的url集合
        self.visted=[]
        #待访问的url集合
        self.unVisited=[]

    #获取访问过的url队列
    def getVisitedUrl(self):
        return self.visted

    #获取未访问的url队列
    def getUnvisitedUrl(self):
        return self.unVisited

    #添加到访问过得url队列中
    def addVisitedUrl(self,url):
        self.visted.append(url)

    #移除访问过得url
    def removeVisitedUrl(self,url):
        self.visted.remove(url)

    #未访问过得url出队列
    def unVisitedUrlDeQuence(self):
        try:
            return self.unVisited.pop()
        except:
            return None

    #保证每个url只被访问一次
    def addUnvisitedUrl(self,url):
        if url!="" and url not in self.visted and url not in self.unVisited:
            self.unVisited.insert(0, url)

    #获得已访问的url数目
    def getVisitedUrlCount(self):
        return len(self.visted)

    #获得未访问的url数目
    def getUnvistedUrlCount(self):
        return len(self.unVisited)

    #判断未访问的url队列是否为空
    def unVisitedUrlsEnmpy(self):
        return len(self.unVisited) == 0


def my_split(s):
    tmp_list = []
    for i in s.split('/'):
        for j in i.split('-'):
            for m in j.split('_'):
                tmp_list.append(m)

    return tmp_list

def similarity(url, hash_size):
    '''
    URL相似度判断
    主要取三个值
    1，netloc的hash值
    2，path字符串拆解成列表的列表长度
    3，path中字符串的长度
    '''
    tmp = urlparse.urlparse(url)
    scheme = tmp[0]; netloc = tmp[1]; path = tmp[2][1:]; query  = tmp[4]
    if len(path.split('/')[-1].split('.')) > 1:
        tail = path.split('/')[-1].split('.')[-1]
    elif len(path.split('/')) == 1 :
        tail = path
    else:
        tail = '1'
    tail = tail.lower()
    path_length = len(path.split('/')) -1
    path_value = 0
    path_list = path.split('/')[:-1] + [tail]
    for i in range(path_length + 1):
        if path_length - i == 0:
            path_value += hash(path_list[path_length - i])%(hash_size-1)
        else:
            path_value += len(path_list[path_length - i])*(10**(i+1))
    netloc_value = hash(hashlib.new("md5", netloc).hexdigest())%(hash_size-1)
    url_value = hash(hashlib.new("md5", str(path_value + netloc_value)).hexdigest())%(hash_size-1)
    return url_value