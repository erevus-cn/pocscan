# coding=utf-8

from frame.beebeeto import Beebeeto
from frame.pocsuite import PocSuite
from frame.tangscan import Tangscan
from frame.kspoc import KsPoc
from frame.bugscan import Bugscan
from pocscanui.settings import SAVE_RESULT_API
import requests as req


class Poc_Launcher(object):

    gevent_num = 100            # 协程数
    process_num = 5             # 进程数
    count = 0   # 每个进程，单独计数
    progress = 100              # 进度提醒的单位

    operator = {
        'beebeeto': Beebeeto,
        'pocsuite': PocSuite,
        'tangscan': Tangscan,
        'kspoc'   : KsPoc,
        'bugscan' : Bugscan,
    }

    def __get_pocs_count(self, poc_files):
        return len(poc_files)

    def save_result(self, target, poc_file, result):
        result = str(result)
        save_result_api_addr = SAVE_RESULT_API
        post = {
             'target': target,
             'poc_file': poc_file,
             'result': result,

        }
        req.post(url=save_result_api_addr, data=post)
        return result

    def poc_verify(self, target, plugin_type, poc_file):
        result = self.operator.get(plugin_type)().run(target, poc_file)
        if result.get('result', False):
            self.save_result(target, poc_file, result.get('result'))
        return result




