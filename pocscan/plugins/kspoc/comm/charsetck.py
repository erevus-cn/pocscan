#!/usr/bin/python
# encoding:utf8

"""检测网页编码

[使用]
1、作为模块导入

import charsetck
charsetck.check(headers,html)

参数说明：
headers：目标URL的http头部信息
html：目标URL的html内容


2、可以直接运行

python charsetck.py http://www.baidu.com 看效果。

[原理]
1、检测http头部是否包含编码
2、上面如果失败，则检测html中的meta是否包含编码
3、上面都失败就使用chardet，但是这里不会拿全部的html去chardet，因为效率会很低，这次会取前几行去判断，提高效率。
"""

__author__ = 'cosine'
__date__ = '2010-04-07'
__version__ = '1.0'

import re
import chardet

# 忽略js里的meta，例如这个页面：http://www.xx007.com/inc/print.js
meta_re = re.compile(r"""<meta[a-zA-Z\-="\s/;]+charset\s*=\s*['"]?\s*([^"'>\s]+)\s*['"]?""",re.I)

def check(headers,html):
    charset = ''

    if headers and headers.has_key('content-type'):
        ct = headers['content-type'].lower()
        i = ct.find('charset=')
        if i != -1:
            charset = ct[i+len('charset='):].split(';')[0]

    if html and not charset:
        ct = meta_re.search(html)
        if ct:
            charset = ct.group(1)

    if html and not charset:
        lines = html.split('\n')
        for i in [10, 50, 120]:
            charset = chardet.detect('\n'.join(lines[:i]))['encoding']
            if charset and charset.lower() != 'ascii':
                break

    if charset == None:
        charset = ''
    return charset.lower()

if __name__ == '__main__':
    import urllib2
    import sys
    import socket
        #默认超时如果已经由A3上层统一管理，就不应自己设置默认超时了
        socket.getdefaulttimeout() or socket.setdefaulttimeout(5)

    try:
        url = sys.argv[1]
    except:
        print 'Usage: python charsetck.py http://www.knownsec.com/'
        sys.exit(0)

    req = urllib2.Request(url)
    req.add_header('User-Agent','Mozilla/4.0 (compatible; MSIE 5.5; Windows NT)')
    usock = urllib2.urlopen(req)
    headers = usock.headers.dict
    html = usock.read()
    usock.close()

    print check(headers,html)