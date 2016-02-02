#!/usr/bin/env python
# coding: utf-8

import gevent
from gevent import monkey
monkey.patch_all(thread=False)
from gevent.queue import Queue
from ..lib import ksprint


def gevent_examine(poc, urlfile=None, headers=None, params=None, request_handler=None):
    '''
    :params urlfile: The file name of urls to test with poc. If urlfile
        is None will use the examples defined in poc infos.
    '''
    if urlfile:
        exec_with_file(poc, urlfile, headers, params, request_handler)
    else:
        exec_with_examples(poc, params)


def exec_with_file(poc, urlfile, headers, params, request_handler=None):
    # 如果使用单个变量记录全局统计数据，会存在Python2无法给嵌套函数上层函数变量赋值的问题。
    # python3可以使用nonlocal声明。Python2 可以使用dict或者list来使得可以赋值。
    count = {'all': 0, 'fail': 0}
    result= []
    def _request_handler(url):
        output = poc.execute(url, headers, params)
        count['all'] += 1
        if output.is_success():
            result.append(output.result)
            ksprint.print_success('[%s] Success!' % url)
        else:
            count['fail'] += 1
            ksprint.print_error('[%s] Fail! [err] %s' % (url, output.error))
        return output
    if not request_handler:
        request_handler = _request_handler
        async_readfile_and_request(urlfile, request_handler, lambda l: l[:-1], "file")
    ksprint.print_success('Success Count: %d' % (count['all'] - count['fail']))
    for success_result in result:
        ksprint.print_success('Success Count: %s' % success_result)


def exec_with_examples(poc, headers, params):
    for url in poc.samples:
        out = poc.execute(url, headers, params)
        if out.is_success:
            ksprint.print_success('[%s] Success!' % url)
        else:
            ksprint.print_error('[%s] Fail!' % url)


# readfile and request url asynchronously
def async_readfile_and_request(filename, request_handler, line_filter, target_type="file"):
    poolsize = 10

    def request(inputs, outputs, reader):
        while inputs.qsize() > 0 or not reader.successful():
            if inputs.qsize() == 0 and not reader.successful():
                gevent.sleep(0.01)
            inp = inputs.get()
            output = request_handler(inp)
            outputs.put_nowait(output)

    def readfile(filename, inputs):
        with open(filename) as f:
            while 1:
                if inputs.qsize() < 1000:
                    line = f.readline()
                    if line:
                        inp = line_filter(line)
                        inputs.put_nowait(inp)
                    else:
                        break
                else:
                    gevent.sleep(0.01)
    def get_target(target_list, inputs):
        if inputs.qsize() < 1000:
            for inp in target_list:
                if inp:
                    inputs.put_nowait(inp)
                else:
                    break
        else:
            gevent.sleep(0.01)
    inputs = Queue()
    outputs = Queue()
    if target_type == "file":
        reader = gevent.spawn(readfile, filename, inputs)
    else:
        reader = gevent.spawn(get_target, filename, inputs)
    jobs = [gevent.spawn(request, inputs, outputs, reader) for i in xrange(poolsize)]
    gevent.joinall(jobs)
    return outputs

