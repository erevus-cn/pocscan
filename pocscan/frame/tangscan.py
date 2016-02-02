#coding=utf-8
import imp
import sys

from pocscan.config import PLUGINS_DIR

class Tangscan(object):

    plugins_name = 'tangscan'
    result = {
        'vul_info': {},
        'result': {}
    }

    def import_poc(self, path):
        sys.path.append(PLUGINS_DIR+self.plugins_name+'/tangscan')
        poc = imp.load_source('TangScan', path)
        poc = poc.TangScan()
        return poc

    def get_vul_info(self, poc):
        vul_info = {
            'name': poc.info['name'],
            'desc': poc.result['description'],
        }
        return vul_info

    def run(self, target, path):
        try:
            poc = self.import_poc(path)
            poc.option.url = target
            poc.verify()
            if poc.result.status == True:
                self.result['vul_info'] = self.get_vul_info(poc)
                self.result['result'] = poc.result.data
                return self.result
            else:
                return {}
        except Exception,e:
            print e
            return
