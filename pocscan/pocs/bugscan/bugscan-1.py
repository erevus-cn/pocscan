#!/usr/bin/env python
# -*- coding: utf-8 -*-
# __author__ = 'Medici.Yan'
# 引入需要用到的标准库
import urllib

# assign 验证任务的指纹
def assign(service, arg):
    if service == fingerprint.cmseasy: # 指纹为 cmseasy
        return True, arg  # 返回类型为 tuple

# audit 审计函数，通过指纹验证后调用该函数
def audit(arg):
    # 此插件中 arg 为提交的网址
    # 构造要提交数据的目标 URL
    target = arg + '/.git/config'
    # 此漏洞要发送的 POST 数据(Payload)
    # 通过 hackhttp 发送 Payload 到目标
    code, head, body, redirect_url, log = hackhttp.http(
        target)
    # 验证是否存在漏洞
    if '[remote "origin"]' in body:
        # 存在漏洞则输出目标 URL
        security_hole(target, log=log)

# 本地测试时需要加 main 用于调用
if __name__ == '__main__':
    # 导入 sdk
    from dummy import *
    import sys;print sys.path
    # 调用 audit 与 assign
    audit(assign(fingerprint.cmseasy, 'http://127.0.0.1')[1])