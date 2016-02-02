#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import md5
import urllib2

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0001',  # 由Beebeeto官方编辑
            'name': 'Discuz x3.0 /static/image/common/focus.swf 跨站脚本漏洞 POC',  # 名称
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
            'app_name': 'Discuz',  # 漏洞所涉及的应用名称
            'vul_version': ['x3.0'],  # 受漏洞影响的应用版本
            'type': 'Cross Site Scripting',  # 漏洞类型
            'tag': ['Discuz!', 'xss', 'flash xss'],  # 漏洞相关tag
            'desc': 'DiscuzX3.0 static/image/common/focus.swf文件存在FlashXss漏洞。',  # 漏洞描述
            'references': ['http://www.ipuman.com/pm6/137/',  # 参考链接
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        flash_md5 = "c16a7c6143f098472e52dd13de85527f"
        file_path = "/static/image/common/focus.swf"
        verify_url = args['options']['target'] + file_path
        if args['options']['verbose']:
            print '[*] Request URL: ' + verify_url
        request = urllib2.Request(verify_url)
        response = urllib2.urlopen(request)
        content = response.read()
        md5_value = md5.new(content).hexdigest()
        if md5_value in flash_md5:
            args['success'] = True
            args['poc_ret']['xss_url'] = verify_url
            return args
        else:
            args['success'] = False
            return args

    exploit = verify


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
