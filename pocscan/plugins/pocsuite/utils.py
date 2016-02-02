# coding: utf-8

from .env import add_sys_path, abspath

from .lib.kslog import getLogger
from .lib.ksutils import re_listdir, parse_file_path, change_to_py_import_type


logger_warning = getLogger('console-warning')


_registered_pocs = {}


def register(poc_class):
    module_name = poc_class.__module__.split('.')[-1]
    if _registered_pocs.get(module_name, None) is None:
        _registered_pocs[module_name] = poc_class()


def unregister(module_name=None):
    if module_name is not None:
        del _registered_pocs[module_name]
    else:
        for key in _registered_pocs.keys():
            del _registered_pocs[key]


def get_poc_object(filepath):
    _, module_name = parse_file_path(filepath)
    import_module_with_path(filepath)
    return _registered_pocs.get(module_name, None)


def get_all_poc_objects(path, exclude=None):
    add_sys_path(path)
    import_all_poc_module(path, exclude)
    return _registered_pocs


def import_all_poc_module(path, exclude):
    if exclude is None:
        exclude = ['__init__']

    def import_poc(match):
        fname = match.group(1)
        if fname not in exclude:
            import_module_with_name(fname)
            return fname
    path = abspath(path)
    return handle_files_in_directory(import_poc, path)


def get_all_poc_fnames(path, file_name_regex=None):
    return handle_files_in_directory(lambda m: m.group(1), path)


def import_module_with_name(name):
    try:
        return __import__(name, fromlist=['*'])
    except ImportError:
        raise ImportError('No Module [%s]' % name)


def import_module_with_path(path):
    name = change_to_py_import_type(path)
    try:
        return __import__(name, fromlist=['*'])
    except ImportError:
        try:
            return import_module_not_in_sys_path(path)
        except ImportError:
            raise ImportError('No Module [%s]' % name)


def import_module_not_in_sys_path(path):
    try:
        path, name = parse_file_path(path)
        add_sys_path(path)
        return __import__(name, fromlist=['*'])
    except (ImportError, AttributeError):
        # 如果 path 为None 需要捕获AttributeError
        raise ImportError('No Module [%s]' % name)


_POC_RE = r'^(.+)\.py$'


def handle_files_in_directory(handler, path, file_name_regex=None):
    regex = file_name_regex or _POC_RE
    try:
        return re_listdir(path, regex, handler)
    except OSError, e:
        logger_warning.exception(str(e))
