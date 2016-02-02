#! /usr/bin/env python
# -*- coding: utf-8 -*-

"""
Copyright (c) 2013-2014 TangScan developers (http://www.wooyun.org/)
author: fate0 <fate0@wooyun.org>
"""

from __future__ import print_function, absolute_import

import pymongo
from modules.exploit import TSExploit


__all__ = ['TangScan']


class TangScan(TSExploit):
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "mongodb 未授权访问",
            "product": "mongodb",
            "product_version": "all",
            "desc": """
                mongodb 未授权访问, 可能导致敏感数据泄漏
            """,
            "license": self.license.TS,
            "author": ["wooyun"],
            "ref": [
                {self.ref.url: "http://drops.wooyun.org/运维安全/2470"}
            ],
            "type": self.type.misconfiguration,
            "severity": self.severity.medium,
            "privileged": False,
            "disclosure_date": "2010-01-01",
            "create_date": "2014-12-25"
        }

        self.register_option({
            "host": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.str_field,
                "desc": """
                    目标主机
                """
            },
            "port": {
                "default": 27017,
                "required": False,
                "choices": [],
                "convert": self.convert.int_field,
                "desc": """
                    目标端口
                """
            }
        })

        self.register_result({
            "status": False,
            "data": {
                "db_info": {
                    "db_name": ""
                }
            },
            "description": "",
            "error": "",
        })

    def verify(self):
        host = self.option.host
        port = self.option.port

        try:
            conn = pymongo.MongoClient(host=host, port=port)
            db_names = conn.database_names()
        except Exception, e:
            self.result.error = "连接发生错误: {error}".format(error=str(e))
            return

        self.result.status = True
        self.result.data.db_info.db_name = str(db_names)
        self.result.description = "目标 {host} 的 mongodb 可以未授权访问, 数据库名: {db_names}".format(
            host=self.option.host,
            db_names=str(db_names)
        )

    def exploit(self):
        self.verify()


if __name__ == '__main__':
    from modules.main import main
    main(TangScan())