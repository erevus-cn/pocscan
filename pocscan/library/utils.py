# coding=utf-8

from pocscan.config import POCS_DIR,PLUGINS_SUPPORT

import re
import os
import math

#文件模糊搜索
def fuzzyfinder(user_input, pocs_path):
        suggestions = []
        files = os.listdir(pocs_path)
        pattern = '.*?'+user_input+'.*?\.py$'    # Converts 'djm' to 'd.*?j.*?m‘
        regex = re.compile(pattern)         # Compiles a regex.
        for item in files:
            match = regex.search(item)      # Checks if the current item matches the regex.
            if match and item != '__init__.py':
                suggestions.append((len(match.group()), match.start(), pocs_path+'/'+item))
        return [x for _, _, x in sorted(suggestions)]

def get_poc_files(user_search):
    poc = {}
    plugins_name = PLUGINS_SUPPORT
    for plugin_name in plugins_name:
        pocs_path = POCS_DIR + plugin_name
        poc_files = fuzzyfinder(user_search, pocs_path)
        poc.setdefault(plugin_name, poc_files)
    return poc


def url_seg(url_list, process_num):
    # [1,2,3,4,5,6,7,8,9] to [[1, 2, 3, 4], [5, 6, 7, 8], [9]]
    n = int(math.ceil(len(url_list) / float(process_num)))
    return [url_list[i:i + n] for i in range(0, len(url_list), n)]