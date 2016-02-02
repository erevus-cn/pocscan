=====================
详细介绍
=====================

基本结构
=====================

.. code-block:: python
    :linenos:

    class TangScan(TSExploit):
        def __init__(self):
            super(self.__class__, self).__init__()
            self.info = {
                ... ...
            }

            self.register_option({
                ... ...
            })

            self.register_result({
                ... ...
            })

        def verify(self):
            pass

        def exploit(self):
            pass


结构说明::

    1. 在 POC 中需定义名为 TangScan 的类, 而且必须继承于 TSExploit
    2. 需要填写info属性
    3. 调用 register_option 方法注册参数
    4. 调用 register_result 方法注册返回结果
    5. 定义 verify 方法
    6. 定义 exploit 方法

以上一个合法的 POC 需要实现的内容。



info属性说明
======================
**TangScan** 中的info属性是一个python的dict，info中的每个字段如下表，虽然有些字段是非必须的，但是还是强烈建议填写所有字段。

.. list-table::
  :header-rows: 1

  * - 键
    - 值
    - 必须/可选
    - 类型
    - 默认
  * - name
    - POC 名称
    - 必须
    - string
    - ""
  * - product
    - 应用名称
    - 必须
    - string
    - ""
  * - product_version
    - 应用版本号
    - 必须
    - string
    - ""
  * - desc
    - POC 描述
    - 可选
    - string
    - ""
  * - license
    - POC 版权信息
    - 可选
    - 系统定义
    - self.license.TS
  * - author
    - POC 编写者
    - 可选
    - list
    - []
  * - ref
    - POC 相关引用
    - 可选
    - list
    - []
  * - type
    - 漏洞类型
    - 必须
    - 系统定义
    - None
  * - severity
    - 漏洞危害等级
    - 必须
    - 系统定义
    - low
  * - privileged
    - 是否需要认证
    - 可选
    - bool
    - False
  * - disclosure_date
    - 漏洞公开日期
    - 可选
    - string
    - ""
  * - create_date
    - POC 创建日期
    - 可选
    - string
    - ""


license
--------------------

license 表示 POC 的版权信息，使用 ``self.license.xxx`` 进行访问

.. list-table::
  :header-rows: 1

  * - 键
    - 值
  * - TS
    - `TangScan协议 <detail.html#id3>`_
  * - MIT
    - `MIT协议 <http://opensource.org/licenses/MIT>`_
  * - BSD
    - `BSD协议 <http://opensource.org/licenses/BSD-2-Clause>`_
  * - GPL
    - `GPL协议 <http://opensource.org/licenses/gpl-license>`_
  * - LGPL
    - `LGPL协议 <http://opensource.org/licenses/lgpl-license>`_
  * - APACHE
    - `APACHE协议 <http://opensource.org/licenses/Apache-2.0>`_


type
--------------------------
type 表示 POC 的类型，使用 ``self.type.xxx`` 进行访问

.. list-table::
  :header-rows: 1

  * - 键
    - 值
  * - injection
    - 注入(sql注入, 命令注入, xpath注入等)
  * - xss
    - xss跨站脚本攻击
  * - xxe
    - xml外部实体攻击
  * - file_upload
    - 任意文件上传
  * - file_operation
    - 任意文件操作
  * - file_traversal
    - 目录遍历
  * - rce
    - 远程命令/代码执行
  * - lfi
    - 本地文件包含
  * - rfi
    - 远程文件包含
  * - info_leak
    - 信息泄漏(phpinfo信息, 爆路径等)
  * - misconfiguration
    - 错误配置
  * - other
    - 其他


severity
--------------------------
severity 表示 漏洞等级，使用 ``self.severity.xxx`` 进行访问

.. list-table::
  :header-rows: 1

  * - 键
    - 值
  * - high
    - 高
  * - medium
    - 中
  * - low
    - 低


register_option 方法说明
============================

使用 ``register_option`` 方法来注册 POC 的相关参数, ``register_option`` 方法的参数为一个 python 的 dict, 这个 dict 的 key 为用户输入的参数名, value 是一个 python 的 dict, 用于描述用户输入的参数, 其中每个字段如下表, 还是强烈建议填写所有字段。

.. list-table::
  :header-rows: 1

  * - 键
    - 值
    - 必须/可选
    - 类型
    - 默认
  * - default
    - 参数默认值
    - 可选
    - string
    - ""
  * - required
    - 参数是否必须
    - 可选
    - bool
    - False
  * - choices
    - 参数值的可选列表
    - 可选
    - list
    - []
  * - convert
    - 参数类型
    - 可选
    - 系统定义
    - self.convert.str_field
  * - desc
    - 参数描述
    - 可选
    - string
    - ""

convert
------------------------

convert 将用于转换输入的数据，使用 ``self.convert.xxx_field`` 进行转换。

.. list-table::
  :header-rows: 1

  * - 键
    - 值
  * - int_field
    - 转换成整形
  * - str_field
    - 转成字符串
  * - bool_field
    - 转成bool类型
  * - json_field
    - 转成json类型
  * - url_field
    - 转成url类型
  * - email_field
    - 检测是否是email类型

需要注意的是: POC 必须注册 ``url`` 参数 或者 ``host`` 和 ``port`` 参数。

注册 ``url`` 参数:

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


注册 ``host`` 和 ``port`` 参数:

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


register_result 方法说明
============================

使用 ``register_result`` 函数来注册返回结果, ``register_result`` 函数的参数为一个 python 的 dict, 这个 dict 的 key 固定如下表。

.. list-table::
  :header-rows: 1

  * - 键
    - 值
    - 必须/可选
    - 类型
    - 默认
  * - status
    - 是否存在漏洞
    - 必须
    - bool
    - False
  * - data
    - POC返回的数据
    - 必须
    - dict
    - {}
  * - description
    - POC返回可读性良好的数据, 将直接显示在扫描报表中
    - 必须
    - string
    - ""
  * - error
    - POC失败原因
    - 必须
    - string
    - ""

上表中的data字段的value是一个python的dict, data 可以包含下面这些字段。

.. code-block:: json
   :linenos:

    {
        "db_info": {
            "version": "数据库版本信息",
            "db_name": "数据库名",
            "tb_prefix": "表前缀",
            "username": "数据库用户名",
            "password": "数据库密码"
        },
        "sh_info": {
            "url": "webshell的url地址",
            "content": "webshell的内容",
            "password": "webshell的密码"
        },
        "file_info": {
            "url": "文件url",
            "content": "文件内容"
        },
        "user_info": {
            "username": "用户名",
            "password": "用户密码",
            "salt": "盐"
        },
        "cmd_info": {
            "cmd": "执行的命令",
            "output": "命令的输出"
        },
        "service_info": {
            "name": "服务名称",
            "username": "用户名",
            "password": "密码"
        },
        "verify_info": {
            "自定义键": "自定义值"
        }
    }


按照需求在 data 中填写上述字段, 如果已定义的字段没有符合实际情况, 可以在 ``verify_info`` 中自定义键值。


verify 和 exploit 方法说明
==========================
在 ``verify`` 和 ``exploit`` 方法中::

    1. verify 方法只能使用 self.option.url 或者  self.option.host 和 self.option.port
    2. 使用 self.option.xxx 来获取 xxx 的值
    3. 使用 self.result.status 设置 verify 的运行状态
    4. 使用 self.result.data.xxx.yyy 设置 运行结果,
       例如: self.result.data.cmd_info.output = 'test' 设置运行结果


TangScan 协议
==========================

