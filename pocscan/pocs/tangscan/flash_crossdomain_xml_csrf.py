#! /usr/bin/env python
# -*- coding: utf-8 -*-

import urllib2
from xml.dom import minidom
from urlparse import urljoin
from thirdparty import requests
from modules.exploit import TSExploit


class TangScan(TSExploit):
    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "Flash crossdomain.xml CSRF",
            "product": "Flash",
            "product_version": "all",
            "desc": """

            """,
            "license": self.license.TS,
            "author": ['rourou'],
            "ref": [
                    {self.ref.wooyun: "http://drops.wooyun.org/tips/688"},
            ],
            "type": self.type.misconfiguration,
            "severity": self.severity.high,
            "privileged": False,
            "disclosure_date": "2013-10-28",
            "create_date": "2015-08-04",
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
                "verify_info": {
                    "url": "",
                }
            },
            "description": "",
            "error": ""
        })

    def verify(self):
        try:
            crossdomain_url = urljoin(self.option.url, '/crossdomain.xml')
            html = urllib2.urlopen(urllib2.Request(crossdomain_url)).read()
            if not '<cross-domain-polic' in html:
                return 
            else:
                xmldom = minidom.parseString(html)
                for o in xmldom.getElementsByTagName('allow-access-from'):
                        domain = o.getAttribute('domain').strip()
                        if domain == '*':
                            self.result.status = True
                            self.result.data.verify_info.url = self.option.url+'/crossdomain.xml'
                            self.result.description = "目标 {url} 存在flash跨域csrf, 验证url:{verify_url}".format(
                            url=self.option.url,
                            verify_url=self.result.data.verify_info.url
                            )
        except Exception,e :
            self.result.errror = str(e)
            self.print_debug(e)
            self.result.status = False

    def exploit(self):
        return self.verify()

if __name__ == '__main__':
    from modules.main import main
    main(TangScan())
