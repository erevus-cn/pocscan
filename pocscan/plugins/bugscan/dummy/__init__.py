#!/usr/bin/env python
# -*- coding: utf-8 -*-
Bugscan='https://www.bugscan.net/'
from common import *
import util
from functools import partial
from fingerprint import FingerPrint
import hackhttp
import miniCurl

import requests as req
from pocscanui.settings import SAVE_RESULT_API

curl = miniCurl.Curl()
hackhttp=hackhttp.hackhttp()
fingerprint=FingerPrint()

_G = {
    'scanport':False,
    'subdomain': False,
    'target': 'www.abc.com',
    'disallow_ip':['127.0.0.1'],
    'kv' : {},
    #'user_dict':'http://192.168.0.158/1.txt'
    #'pass_dict':'http://192.168.0.158/1.txt'
    }

util._G = _G

def debug(fmt, *args):
    print(fmt % args)

LEVEL_NOTE = 0
LEVEL_INFO =1
LEVEL_WARNING = 2
LEVEL_HOLE = 3

def _problem(*args, **kwargs):
    # 从栈里取poc名字
    import inspect
    poc_name =  inspect.stack()[1][1]
    log = kwargs['log']
    print type(log)
    # debug('[LOG] <%s> %s (uuid=%s)', ['note', 'info', 'warning', 'hole'][level], body,str(uuid))
    if log.has_key('url'):
        save_result(log['url'], poc_name, str(log))
    else:
        save_result(str(args[0]), poc_name, str(args))
        # save_result(str(args), 'Bugscan POC', str(args))


security_note = partial(_problem,LEVEL_NOTE)
security_info = partial(_problem,LEVEL_INFO)
security_warning = partial(_problem,LEVEL_WARNING)
security_hole = partial(_problem,LEVEL_HOLE)

def task_push(service, arg, uuid = None, target=None):
    if uuid is None:
        uuid = str(arg)
        
    debug('[JOB] <%s> %s (%s/%s)', service, arg, uuid, target)

def save_result(target, poc_file, result):
    result = str(result)
    save_result_api_addr = SAVE_RESULT_API
    post = {
         'target': target,
         'poc_file': poc_file,
         'result': result,

    }
    req.post(url=save_result_api_addr,  data=post)
    return result