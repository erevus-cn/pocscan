# coding=utf-8

import sys
import imp

from pocscan.config import PLUGINS_DIR

#临时解决方案
class PocSuite(object):

    plugins_name = 'pocsuite'
    result = {
        'vul_info': {},
        'result': {}
    }

    def import_poc(self, path):
        sys.path.append(PLUGINS_DIR)
        poc = imp.load_source('TestPOC', path)
        poc = poc.TestPOC()
        return poc

    def get_vul_info(self, poc):
        vul_info = {
            'name': poc.name,
            'desc': poc.desc,
        }
        return vul_info

    def run(self, target, path):
        try:
            poc = self.import_poc(path)
            verify_result =  poc.execute(target, mode='verify')
            if verify_result.result:
                self.result['vul_info'] = self.get_vul_info(poc)
                self.result['result'] = verify_result.result
                return self.result
            else:
                return {}
        except Exception,e:
            print e
            return