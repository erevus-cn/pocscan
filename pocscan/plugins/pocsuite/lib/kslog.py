#!/usr/bin/env python
# encoding: utf-8
# by wenshin


import os
import logging
# 直接引用本地logcolorer模块，hack logging 包的默认设置
from . import logcolorer
import logging.config
from datetime import datetime


def make_logfile(path, loggername, ftype):
    fname = date_filename(loggername, ftype)
    return os.path.join(path, fname)


def date_filename(loggername, ftype):
    today = datetime.today()
    date_part = '_%d%02d%02d' % (today.year, today.month, today.day)
    return loggername + date_part + ftype


default_name = 'kslog'
default_ftype = '.txt'
default_path = os.getcwd()
default_logfile = make_logfile(default_path, default_name, default_ftype)

LOGGER_NAME = ('console-debug', 'console-warning')
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '%(asctime)s | %(levelname)-7s | %(module)s-%(lineno)s: %(message)s'
        },
        'simple': {
            'format': '%(levelname)-7s | %(module)s-%(lineno)s: %(message)s'
        }
    },
    'handlers': {
        'console-debug': {
            'level': 'DEBUG',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        },
        'console-warning': {
            'level': 'WARNING',
            'class': 'logging.StreamHandler',
            'formatter': 'simple'
        },
        'file': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'formatter': 'verbose',
            'filename': default_logfile,
        },
    },
    'loggers': {
        LOGGER_NAME[0]: {
            'handlers': ['file', 'console-debug'],
            'level': 'DEBUG',
            'propagate': True,
        },
        LOGGER_NAME[1]: {
            'handlers': ['file', 'console-warning'],
            'level': 'DEBUG',
            'propagate': True,
        },
    },
}


class LoggerNotDefined(Exception):
    def __str__(self):
        return 'The logger name not defined in our libary!'


def initLogging(path=default_path, fname=None):
    if fname:
        logfile = make_logfile(path, fname, default_ftype)
        LOGGING['handlers']['file']['filename'] = logfile
    logging.config.dictConfig(LOGGING)


def getLogger(name='console-debug'):
    '''
    :param verbose: When verbose is False,
                    the level of console output will be WANING
    '''

    try:
        if name not in LOGGER_NAME:
            raise LoggerNotDefined
        return logging.getLogger(name)
    except Exception:
        return logging.getLogger()


if __name__ == '__main__':
    initLogging()
    logger = getLogger()
    logger.info('info')
    logger.warn('warn')
    logger.debug('debug')
    logger.error('error')
    try:
        a = {}
        print a.bbb
    except AttributeError, e:
        logger.exception(str(e))

    logger = getLogger('console-warning')
    logger.info('info')
    logger.warn('warn')
    logger.error('error')
