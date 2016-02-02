#! /usr/bin/env python
# -*- coding: utf-8 -*-

from modules.exploit import TSExploit


class TangScan(TSExploit):
    """
    类名必须是TangScan，而且需要继承于TSExploit
    """
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "",  # 该POC的名称
            "product": "",  # 该POC所针对的应用名称, 严格按照 tangscan 主页上的进行填写
            "product_version": "",  # 应用的版本号
            "desc": """

            """,  # 该POC的描述
            "license": self.license.TS,  # POC的版权信息
            "author": [""],  # 编写POC者
            "ref": [
                {self.ref.url: ""},  # 引用的url
                {self.ref.wooyun: ""},  # wooyun案例
            ],
            "type": self.type.injection,  # 漏洞类型
            "severity": self.severity.high,  # 漏洞等级
            "privileged": False,  # 是否需要登录
            "disclosure_date": "2014-09-17",  # 漏洞公开时间
            "create_date": "2014-09-17",  # POC 创建时间
        }

        self.register_option({
            "url": {  # POC 的参数 url
                "default": "",  # 参数的默认值
                "required": True,  # 参数是否必须
                "choices": [],  # 参数的可选值
                "convert": self.convert.url_field,  # 参数的转换函数
                "desc": ""  # 参数的描述
            }
        })

        self.register_result({
            "status": False,  # POC 的返回状态
            "data": {

            },  # POC 的返回数据
            "description": "",  # POC 返回对人类良好的信息
            "error": ""  # POC 执行失败的原因
        })

    def verify(self):
        """
        验证类型，尽量不触发waf规则
        :return:
        """
        pass

    def exploit(self):
        """
        攻击类型
        :return:
        """
        pass


if __name__ == '__main__':
    from modules.main import main
    main(TangScan())