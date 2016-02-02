#!/usr/bin/env python
# coding=utf-8

# Create: 2014-07-15
# Author: www.beebeeto.com
# Team: n0tr00t security team

import os
import sys
import json
import traceback

from pprint import pprint
from optparse import OptionParser, OptionGroup

from utils import http


BEEBEETO_STATEMENT = \
    "This POC is created for security research. "\
    "It cannot be used in illegal ways, the user should be responsible for the usage of it."\
    "All Rights Reserved by BeeBeeTo.com."



class BaseFrame(object):
    poc_info = {
        # id/name to be edit by BeeBeeto
        'poc': {
            'id': None,
            'name': None,
            'author': 'Beebeeto',
            'create_date': '2014-07-15',
        },
        # to be edit by you
        'protocol': {
            'name': None,  # 'openssl' e.g.
            'port': None,  # must be int type, 443 e.g.
            'layer4_protocol': ['tcp'],
        },
        # to be edit by you
        'vul': {
            'app_name': None,
            'vul_version': None,
            'type': None,
            'tag': [],
            'desc': None,
            'references': [],
        },
    }

    def __init__(self, run_in_shell=True):
        if run_in_shell:
            self._init_parser()
        self.run_in_shell = run_in_shell

    def _init_parser(self, do_parse=True):
        usage = 'usage: %prog [options] arg1 arg2'
        self.base_parser = OptionParser(usage=usage, description=BEEBEETO_STATEMENT)
        self.user_parser = OptionGroup(self.base_parser,
                                       title='POC Specified Options',
                                       description='These options are specified by the author'
                                                   ' of this poc, so they are available'
                                                   ' only in this poc.')
        self.base_parser.add_option_group(self.user_parser)
        self.__init_base_parser()
        self._init_user_parser()

        if do_parse:
            (self.options, self.args) = self.base_parser.parse_args()
            if not self.options.target:
                print '\n[*] No target input!\n'
                self.base_parser.print_help()
                sys.exit()

    def __init_base_parser(self):
        self.base_parser.add_option('-t', '--target', action='store', dest='target',
                                    default=None, help='the target to be checked by this poc.')
        self.base_parser.add_option('-v', '--verify',
                                    action='store_true', dest='verify', default=True,
                                    help='run poc in verify mode.')
        self.base_parser.add_option('-e', '--exploit',
                                    action='store_false', dest='verify',
                                    help='run poc in exploit mode.')
        self.base_parser.add_option('--verbose', action='store_true', dest='verbose',
                                    default=False, help='print verbose debug information.')
        self.base_parser.add_option('--info', action='callback', callback=self.__cb_print_poc_info,
                                    help='print poc information.')

    def _init_user_parser(self):
        #self.user_parser.add_option('-x', help='example')
        pass

    def __cb_print_poc_info(self, option, opt, value, parser):
        print(json.dumps(self.poc_info, ensure_ascii=False, indent=2))
        sys.exit()

    @classmethod
    def normalize_target(cls, target):
        if cls.poc_info['protocol']['name'] == 'http':
            return http.normalize_url(target)
        elif cls.poc_info['protocol']['name'] == 'https':
            return http.normalize_url(target, https=True)
        else:
            return target

    def run(self, options=None, debug=False):
        options = self.options.__dict__ if self.run_in_shell else options
        options['target'] = self.normalize_target(options['target'])
        args = {
            'options': options,
            'success': False,
            'poc_ret': {},
        }
        result = {}
        try:
            if options['verify']:
                args = self.verify(args)
            else:
                args = self.exploit(args)
            result.update(args)
        except Exception, err:
            if debug:
                traceback.print_exc()
                sys.exit()
            result.update(args)
            result['exception'] = str(err)
        return result

    @classmethod
    def verify(cls, args):
        '''
        main code here.
        '''
        return args

    @classmethod
    def exploit(cls, args):
        '''
        main code here.
        '''
        return args


if __name__ == '__main__':
    from pprint import pprint

    bf = BaseFrame()
    pprint(bf.run())