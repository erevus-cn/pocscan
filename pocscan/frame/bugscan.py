#coding=utf-8
import imp
import sys

from pocscan.config import PLUGINS_DIR

class Bugscan(object):

    plugins_name = 'bugscan'
    result = {
        'vul_info': {},
        'result': {}
    }

    def import_poc(self, path):
        filename = path.split("/")[-1].split(".py")[0]
        poc_path = path.split(filename+".py")[0]
        sys.path.append(poc_path)
        poc = imp.load_source('audit', path)
        audit_function = poc.audit
        return audit_function

    def get_vul_info(self, poc):
        vul_info = {
            'name': self.plugins_name,
        }
        return vul_info

    def run(self, target, path):
        try:
            target +='/'
            audit_function = self.import_poc(path)
            sys.path.append(PLUGINS_DIR+'bugscan/')
            from dummy import *
            audit_function.func_globals.update(locals())
            ret = audit_function(target)
            return self.result
        except Exception,e:
            print e
            return self.result
