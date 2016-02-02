#coding=utf-8
import imp
import sys

from pocscan.config import PLUGINS_DIR

class Beebeeto(object):

    plugins_name = 'beebeeto'
    result = {
        'vul_info': {},
        'result': {}
    }

    def import_poc(self, path):
        sys.path.append(PLUGINS_DIR+self.plugins_name)
        poc = imp.load_source('MyPoc', path)
        return poc

    def get_vul_info(self, poc):
        vul_info = {
            'name': poc.MyPoc.poc_info['poc']['name'],
            'desc': poc.MyPoc.poc_info['vul']['desc'],
        }
        return vul_info

    def run(self, target, path):
        try:
            poc = self.import_poc(path)
            options = {
                'target': target,
                'verify': True,
                'verbose': False,
            }
            ret = poc.MyPoc(False).run(options=options, debug=False)
            if ret['success'] == True:
                self.result['vul_info'] = self.get_vul_info(poc)
                self.result['result'] = ret['poc_ret']
                return self.result
            else:
                return {}
        except Exception,e:
            print e
            return
