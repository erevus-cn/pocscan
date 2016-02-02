#!/usr/bin/env python
# coding=utf-8
# author=evi1m0&2

import socket
import urlparse

def normalize_url(url, https=False):
    '''
    author: windows2000
    function:
        add 'http://' or 'https://' prefix to a url if missed
    '''
    if not url:
        return
    elif url.startswith(('http://', 'https://')):
        return url
    if not https:
        url = 'http://' + url
    else:
        url = 'https://' + url
    return url

def transform_target_ip(target):
    if urlparse.urlparse(target).netloc == '':
        target = urlparse.urlparse(target).path
    else:
        target = socket.gethostbyname(urlparse.urlparse(target).netloc)
    return target
