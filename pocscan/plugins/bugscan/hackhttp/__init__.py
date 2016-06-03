# -*-coding:utf-8-*-

r"""
 _                _    _     _   _
| |__   __ _  ___| | _| |__ | |_| |_ _ __
| '_ \ / _` |/ __| |/ / '_ \| __| __| '_ \
| | | | (_| | (__|   <| | | | |_| |_| |_) |
|_| |_|\__,_|\___|_|\_\_| |_|\__|\__| .__/
                                    |_|
===========================================
hackhttp Library

Hackhttp is an HTTP library, written in Python.

Send HTTP GET request:

usage:

>>> import hackhttp
>>> hh = hackhttp.hackhttp()
>>> code, head, body, redirect, log = hh.http('https://www.bugscan.net')
>>> code
200
>>> '<html ng-app="Bugscan">' in body
True
>>>

... or POST:

>>> import hackhttp
>>> hh = hackhttp.hackhttp()
>>> code, head, body, redirect, log = hh.http('http://httpbin.org/post', post="key1=val1&key2=val2")
>>> code
200
>>> print body
{
  ...
  "form": {
    "key1": "val1",
    "key2": "val2"
  },
  ...
}

>>>

... or RAW:

>>> import hackhttp
>>> hh = hackhttp.hackhttp()
>>> raw='''POST /post HTTP/1.1
... Host: httpbin.org
... User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10.11; rv:45.0) Gecko/20100101 Firefox/45.0
... Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
... Accept-Language: zh-CN,zh;q=0.8,en-US;q=0.5,en;q=0.3
... Accept-Encoding: gzip, deflate
... Connection: close
... Content-Type: application/x-www-form-urlencoded
... Content-Length: 19
...
... key1=val1&key2=val2'''
>>> code, head, html, redirect, log = hh.http('http://httpbin.org/post', raw=raw)
>>> code
200
>>> print html
{
  ...
  "form": {
    "key1": "val1",
    "key2": "val2"
  },
  ...
}

>>>
"""

__title__ = 'hackhttp'
__version__ = '1.0.3'
__build__ = 0x020700
__author__ = 'BugScanTeam'
__author_email__ = 'admin@bugscan.net'
__url__ = 'https://github.com/BugScanTeam/hackhttp'
__license__ = 'GPL 2.0'
__copyright__ = 'Copyright 2016 Seclover'

from hackhttp import *
