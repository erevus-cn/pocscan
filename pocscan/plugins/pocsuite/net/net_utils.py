#!/usr/bin/env python
# coding: utf-8

"""
include requests v2.3.0 and reset the `_Default` of requests
inside urllib3 to `None` value for support global timeout.
"""

import socks
import socket as soc
from urlparse import urlparse
from ..lib import ksprint

from ..lib.kslog import getLogger
from ..lib.ksutils import deep_extend
from ..packages import requests as req

# fix requests to support socket global timeout value.
from ..packages.requests.packages.urllib3 import util as inside_urllib3_util

if hasattr(inside_urllib3_util, '_Default'):
    inside_urllib3_util._Default = None
else:
    inside_urllib3_util.timeout._Default = None

GLOBAL_TIMEOUT = 10  # unit second
soc.setdefaulttimeout(GLOBAL_TIMEOUT)

logger_warning = getLogger('console-warning')
default_header = {
    'Accept': '*/*',
    'Accept-Charset': 'GBK,utf-8;q=0.7,*;q=0.3',
    'Accept-Language': 'zh-CN,zh;q=0.8',
    'Cache-Control': 'max-age=0',
    'Connection': 'keep-alive',
    'Referer': 'http://www.baidu.com',
    'User-Agent': ('Mozilla/5.0 (Windows NT 6.1; '
                   'WOW64) AppleWebKit/537.17 (KHTML, like Gecko) '
                   'Chrome/24.0.1312.52 Safari/537.17')
}


def custom_header(params):
    """
    """
    try:
        header = deep_extend(default_header, params)
    except Exception, e:
        logger_warning.error(str(e))
        header = None
    return header


def resolve_url(url):
    try:
        return urlparse(url)
    except Exception, e:
        logger_warning.error(str(e))
        return None


def fix_url(url):
    if not url.startswith('http'):
        url = 'http://' + url
    if url.endswith('/'):
        url = url[:-1]
    return url


def init_proxy(proxy):
    res = urlparse(proxy)

    use_proxy = True
    if res.scheme == 'socks4':
        mode = socks.SOCKS4
    elif res.scheme == 'socks5':
        mode = socks.SOCKS5
    elif res.scheme == 'http':
        mode = socks.HTTP
    else:
        use_proxy = False
        ksprint.print_error('Unknown proxy "%s", starting without proxy...' % proxy)

    if use_proxy:
        socks.set_default_proxy(mode, res.netloc.split(':')[0], int(res.netloc.split(':')[1]))
        soc.socket = socks.socksocket
        ksprint.print_success('[*] Proxy "%s" using' % proxy)
