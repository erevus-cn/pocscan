#! /usr/bin/env python
# -*- coding: utf-8 -*-

"""
Copyright (c) 2013-2014 tangscan developers (http://www.wooyun.org/)
See the file 'docs/COPYING' for copying permission
author: fate0 <fate0@wooyun.org>
"""

import json
import argparse

from exploit import TSLogLevel, TSSeverity, TSType


def main(ts_instance):
    parser = argparse.ArgumentParser()
    parser.add_argument('--debug', required=False, action="store_true", help="显示测试信息")
    parser.add_argument('--mode', required=False, default="verify", choices=["verify", "exploit"],
                        help="POC 执行模式, default: verify [str_filed] ")

    for option, option_filter in ts_instance.option.items():
        if not hasattr(option_filter, 'default'):
            option_filter['default'] = ''
        if not hasattr(option_filter, 'desc'):
            option_filter['desc'] = ''
        if not hasattr(option_filter, 'required'):
            option_filter['required'] = True
        if not hasattr(option_filter, 'choices') or not option_filter['choices']:
            option_filter['choices'] = None
        if not hasattr(option_filter, 'convert') or not option_filter['convert']:
            option_filter['convert'] = ts_instance.convert.str_field

        if option_filter['default']:
            help_string = "{desc} default: {default} [{convert}]".format(desc=option_filter['desc'],
                                                                         convert=option_filter['convert'].__name__,
                                                                         default=option_filter['default'])
        else:
            help_string = "{desc} [{convert}]".format(desc=option_filter['desc'],
                                                      convert=option_filter['convert'].__name__)

        parser.add_argument('--{option}'.format(option=option),  required=option_filter['required'],
                            default=option_filter['default'], choices=option_filter['choices'],
                            help=help_string)

    args = vars(parser.parse_known_args()[0])

    for option, option_filter in ts_instance.option.items():
        input_option_value = args.get(option, '')

        if not input_option_value:
            ts_instance.option[option] = option_filter['default']
        ts_instance.option[option] = option_filter['convert'](input_option_value)

    if args['debug']:
        ts_instance.log_level = TSLogLevel.debug

    if args['mode'] == 'exploit':
        ts_instance.exploit()
    else:
        ts_instance.verify()

    try:
        results = [ts_instance.result.to_python()]
        json.dumps(results)
    except Exception, e:
        print('result 无法被 json 序列化, 请不要将不可序列化的对象填写至 result 中')
        print(e)
        return

    if ts_instance.result.status:
        print('[POC 编写者]')
        print('\t{poc_author}'.format(poc_author=str(ts_instance.info.get('author', ''))))
        print('[风险]')
        print('\t目标 {target} 存在 {poc_name}'.format(
            target=ts_instance.option.get('host', ts_instance.option.get('url', '')),
            poc_name=ts_instance.info.get('name', '').strip()
        ))

        print('[详细说明]')
        print('\t{poc_desc}'.format(poc_desc=ts_instance.info.get('desc', '').strip()))

        print('[程序返回]')
        print('\t{poc_return}'.format(poc_return=ts_instance.result.get('description', '').strip()))

        print('[危害等级]')
        print('\t{poc_severity}'.format(poc_severity=ts_instance.info.get('severity', '')))

        print('[漏洞类别]')
        print('\t{poc_type}'.format(poc_type=ts_instance.info.get('type', '')))

        print('[相关引用]')
        for each_ref in ts_instance.info.get('ref', {}):
            if not each_ref:
                return

            ref_key = each_ref.keys()[0]
            print('\t* {ref_key}: {ref_value}'.format(ref_key=ref_key, ref_value=each_ref.get(ref_key).strip()))
    else:
        print('[POC 执行失败]: 目标不存在该漏洞 !!!')
        ts_instance.print_error(ts_instance.result.error)


