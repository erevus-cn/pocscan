#!/usr/bin/env python
# encoding: utf-8
# by wenshin

from .lib import ksprint

_POC_INFO = ('vulID', 'version', 'author', 'vulDate',
             'name', 'appVersion', 'samples', 'desc',
             'createDate', 'updateDate', 'references',
             'appPowerLink', 'vulType', 'appName')


def check_poc_if_violation(poc_obj, verbose=True):
    violation = False
    ksprint.print_sysinfo('Checking POC [%s] ...' % poc_obj.name)
    violation = _check_info(poc_obj, verbose)
    ksprint.print_sysinfo('Checking POC [%s] finished!' % poc_obj.name)
    ksprint.print_info('-' * 40)
    if not violation:
        ksprint.print_success('POC [%s] No Violation!' % poc_obj.name)
    ksprint.print_info('=' * 40)
    return violation


def _check_info(poc_obj, verbose):
    violation = False
    ksprint.print_sysinfo('[Info] ...')
    for attr in _POC_INFO:
        if hasattr(poc_obj, attr):
            if verbose:
                ksprint.print_info('%s : %s' % (attr, getattr(poc_obj, attr)))
        else:
            ksprint.print_error('%s : %s' % (attr, 'Do not defined!'))
            violation = True
    ksprint.print_sysinfo('[Info] finished!')
    return violation
