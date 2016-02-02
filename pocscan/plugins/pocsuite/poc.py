#!/usr/bin/env python
# coding: utf-8

import types
import argparse

from .lib import ksprint


from .lib.kslog import getLogger
from .net import resolve_url, fix_url

logger_debug = getLogger('console-debug')
logger_warning = getLogger('console-warning')

# Value of Output.status
_SUCC = 1
_FAIL = 0


class Output(object):
    ''' output of pocs
    Usage::
        >>> poc = POCBase()
        >>> output = Output(poc)
        >>> result = {'FileInfo': ''}
        >>> output.success(result)
        >>> output.fail('Some reason failed or errors')
    '''
    def __init__(self, poc=None):
        if poc:
            self.url = poc.url
            self.mode = poc.mode
            self.vulID = poc.vulID
        self.error = ''
        self.result = {}
        self.status = _FAIL

    def is_success(self):
        return True if self.status == _SUCC else False

    def success(self, result):
        assert isinstance(result, types.DictType)
        self.status = _SUCC
        self.result = result

    def fail(self, error):
        self.status = _FAIL
        assert isinstance(error, types.StringType)
        self.error = error

    def print_result(self):
        if self.status == _SUCC:
            ksprint.print_success('Executing POC ID: [%s] Success!' % self.vulID)
            ksprint.print_sysinfo('Result\n')
            for k, v in self.result.items():
                if isinstance(v, dict):
                    for kk, vv in v.items():
                        ksprint.print_sysinfo('\t%s : %s' % (kk, vv))
                else:
                    ksprint.print_sysinfo('\t %s : %s' % (k, v))
        else:
            ksprint.print_error('Executing POC ID: [%s] Failed!' % self.vulID)


class Params(argparse.Namespace):
    """ Generate a object to manage any parameters
    Usage::
        >>> p = Params(arg1='arg1', arg2='arg2')
        >>> p.arg1
        'arg1'
        >>> p.arg2
        'arg2'
    """
    pass


# Value of POCBase.mode
_VER = 'verify'
_ATT = 'attack'
_EXA = 'examine'


class POCBase(object):
    """
    使用场景，限制说明
    """
    def __init__(self):
        self.target = None
        self.url = None
        self.mode = None
        self.params = None
        self.logger = None
        self.verbose = None
        self.resolved_url = None

    def execute(self, target, headers=None, params=None, mode=_VER, verbose=True):
        """
        :param url: the target url
        :param headers: a :class dict include some fields for request header.
        :param params: a instance of Params, includ extra params
            for execute poc, including but not limited to

            verify-code:
            form-action:
            auth-type:
            auth-cred:
            form-cred:
            username:
            password:
            payload:
            cookie:
            email:

        :param mode: 'verify', 'attack', 'examine'
        :param verbose: if set False will only show important
            information.

        :return: A instance of Output
        """
        self.target = target
        self.url = fix_url(target)
        self.resolved_url = resolve_url(self.url)
        self.headers = headers
        self.params = params
        self.mode = mode
        self.verbose = verbose
        if verbose:
            self.logger = logger_debug
        else:
            self.logger = logger_warning
        # TODO
        output = None

        try:
            if self.mode == _ATT:
                output = self._attack()
            else:
                output = self._verify()
        except NotImplementedError:
            self.logger.error('POC: %s not defined '
                              '%s mode' % (self.name, self.mode))
            output = Output(self)
        except Exception, e:
            self.logger.error(str(e))
            output = Output(self)
        return output

    def _attack(self):
        ''' Run attack mode

        Need to been overridden.
        Return a instance of Output class.
        '''
        raise NotImplementedError

    def _verify(self):
        ''' Run verify mode

        Need to been overridden.
        Return a instance of Output class.
        '''
        raise NotImplementedError
