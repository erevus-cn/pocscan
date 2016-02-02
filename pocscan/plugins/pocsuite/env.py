# coding: utf-8

import os
import sys


CWDPATH = os.getcwd()


def add_sys_path(*paths):
    for path in paths:
        if not path.startswith('/'):
            path = os.path.join(CWDPATH, path)
        sys.path.append(path)


def abspath(path):
    return os.path.join(CWDPATH, path)


def add_cwd_to_path():
    sys.path.append(CWDPATH)
