#! /usr/bin/env python
# -*- coding: utf-8 -*-

from modules.exploit import TSExploit


class TangScan(TSExploit):
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "",
            "product": "",
            "product_version": "",
            "desc": """

            """,
            "license": self.license.TS,
            "author": [""],
            "ref": [
                {self.ref.wooyun: ""},
            ],
            "type": self.type.sql_injection,
            "severity": self.severity.medium,
            "privileged": False,
            "disclosure_date": "2014-09-17",
            "create_date": "2014-09-17",
        }

        self.register_option({
            "url": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.url_field,
                "desc": "目标 url"
            },

            "host": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.str_field,
                "desc": "目标 host"
            },
            "port": {
                "default": "",
                "required": False,
                "choices": [],
                "convert": self.convert.int_field,
                "desc": "端口"
            }
        })

        self.register_result({
            "status": False,
            "data": {

            },
            "description": "",
            "error": ""
        })

    def verify(self):
        pass

    def exploit(self):
        pass


if __name__ == '__main__':
    from modules.main import main
    main(TangScan())
