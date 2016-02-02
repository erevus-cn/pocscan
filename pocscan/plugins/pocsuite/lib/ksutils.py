#!/usr/bin/env python
# coding: utf-8


import re
from os import listdir
import copy as copylib
from types import DictType

copy = copylib.copy
deepcopy = copylib.deepcopy


class CopyException(Exception):
    '''
    shallow copy or deep copy error
    '''
    pass


def _exec_copy(src, deep=False):
    copied = None
    try:
        if deep:
            copied = copylib.deepcopy(src)
        else:
            copied = copylib.copy(src)
    except:
        raise CopyException()
    return copied


def copy(src):
    return _exec_copy(src)


def deepcopy(src):
    return _exec_copy(src, deep=True)


def deep_extend(target, src):
    '''
    !!! Only for dict yet
    e.g.
    >>> target = {'a': 1, 'b': 2}
    >>> src = {'a': 2, 'c': 3}
    >>> output = deep_extend(target, src)
    output is {'a': 2, 'b': 2, 'c': 3} and deep copy from target
    if error will return None
    '''
    return _extend(target, src, deep=True)


def extend(target, src):
    '''
    !!! Only for dict yet
    e.g.
    >>> target = {'a': 1, 'b': 2}
    >>> src = {'a': 2, 'c': 3}
    >>> output = deep_extend(target, src)
    output is {'a': 2, 'b': 2, 'c': 3} and shallow copy from target
    if error will return None
    '''
    return _extend(target, src)


def _extend(target, src, deep=False):
    assert isinstance(src, DictType)
    assert isinstance(target, DictType)

    if deep:
        target_copy = deepcopy(target)
    else:
        target_copy = copy(target)

    if target_copy:
        for k, v in src.iteritems():
            target_copy[k] = v
    return target_copy


def deep_update(target, src):
    '''
    !!! Only for dict yet
    e.g.
    >>> target = {'a': 1, 'b': 2}
    >>> src = {'a': 2, 'c': 3}
    >>> output = deep_extend(target, src)
    output is {'a': 2, 'b': 2} and deep copy from target
    if error will return None
    '''
    return _update(target, src, deep=True)


def update(target, src):
    '''
    !!! Only for dict yet
    e.g.
    >>> target = {'a': 1, 'b': 2}
    >>> src = {'a': 2, 'c': 3}
    >>> output = deep_extend(target, src)
    output is {'a': 2, 'b': 2} and shallow copy from target
    if error will return None
    '''
    return _update(target, src)


def _update(target, src, deep=False):
    assert isinstance(src, DictType)
    assert isinstance(target, DictType)

    if deep:
        target_copy = deepcopy(target)
    else:
        target_copy = copy(target)

    for k in target_copy.iterkeys():
        if k in src:
            target_copy[k] = src[k]
    return target_copy


def re_listdir(path, regex, handler=lambda m: m):
    ''' Filter all files in specified directory

    :param path: the directory to search
    :param regex: the regex expression string
    :type regex: string
    :param handler: the function process the matchs
    :return: the match objects of module 're'
    :rtype: list
    '''
    filenames = listdir(path)
    fname_re = re.compile(regex)
    matchs = []

    for filename in filenames:
        match = fname_re.match(filename)
        if match:
            matchs.append(handler(match))
        else:
            continue
    return matchs


# check types
def is_iterable(target):
    import collections
    if isinstance(target, collections.Iterable):
        return True
    else:
        return False


# file operate
def re_readline(file_obj, regex, handler):
    line_re = re.compile(regex)
    line = file_obj.readline()
    match = line_re.match(line)
    if match:
        match = handler(match)
    return match


def parse_file_path(path):
    re_obj = re.compile(r'^(?P<path>.+/)?((?P<fname>[^./]+)(\.[^./]+)?)?$')
    match = re_obj.match(path)
    return match.group('path'), match.group('fname')


def change_to_py_import_type(path):
    """
    :param path: the path type behind
        * change `'/path/to/module.py'` to `'path.to.module'`
        * change `'/path/to/'` to `'path.to'`
        * change `'/path/to'` to `'path.to'`
        * change `'path/to/module.py'` to `'path.to.module'`
        * change `'path/to'` to `'path.to'`
        * change `'path/to'` to `'path.to'`

    :return: str
    """
    path, name = parse_file_path(path)
    name = name if name is not None else ''
    if path is not None:
        path = path.strip('/').replace('/', '.')
        if name != '':
            name = '.' + name
    else:
        path = ''
    return path + name
