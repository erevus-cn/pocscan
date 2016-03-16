#coding=utf-8
import imp
import sys

from pocscan.config import PLUGINS_DIR

class KsPoc(object):

    plugins_name = 'kspoc'
    result = {
        'vul_info': {},
        'result': {}
    }

    def import_poc(self, path):
        sys.path.append(PLUGINS_DIR+self.plugins_name)
        poc = imp.load_source('main', path)
        return poc

    def get_vul_info(self, poc):
        vul_info = {
            'name': poc.poc_info['Name'],
            'desc': poc.poc_info['Desc'],
        }
        return vul_info

    def run(self, target, path):
        try:
            poc = self.import_poc(path)
            self.io_info = {
                'Status': 0,
                'Verbose': False,
                'URL': target,
                'Mode': 'v',
                'Error': '',
                'Result': {}
            }
            poc.main(self.io_info)
            if self.io_info['Status'] == 1:
                self.result['vul_info'] = self.get_vul_info(poc)
                self.result['result'] = self.io_info['Result']
                return self.result
            else:
                return {}
        except Exception,e:
            print e
            return
