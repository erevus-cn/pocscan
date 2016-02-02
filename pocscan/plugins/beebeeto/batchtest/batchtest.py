#!/usr/bin/env python
# coding=utf-8
# author=ff0000team

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/ff0000team/Beebeeto-framework
"""

import sys
sys.path.append('../')

import threadpool

from copy import deepcopy
from gevent import socket, monkey
from utils.http import normalize_url

try:
    import simplejson as json
except ImportError:
    import json


monkey.patch_socket()
socket.setdefaulttimeout = 5


class BatchTest(object):
    default_options = {
        'target': None,
        'verify': True,
        'verbose': False,
    }

    def __init__(self, seed_file, func2run, options=None,
                 result_file='result.txt',
                 thread_num=100, verbose=True):
        self.func2run = func2run
        self.options = options if options else self.default_options
        self.seed_iter = open(seed_file, 'rbU')
        self.total_num = 0
        self.result_fobj = open(result_file, 'wb')
        self.finished_num = 0
        self.err_num = 0
        self.success_num = 0
        self.tp = threadpool.ThreadPool(num_workers=thread_num)


    def cbSaveResult(self, request, result):
        self.finished_num += 1
        print '%d : %s' % (self.err_num+self.finished_num, str(result))
        if result['success']:
            self.success_num += 1
        self.result_fobj.write(json.dumps(result) + '\n')

    def cbHandleErr(self, request, exc_info):
        self.err_num += 1
        result = deepcopy(request.args[0])
        result['exception'] = str(exc_info[1])
        self.result_fobj.write(json.dumps(result) + '\n')

    def batchTest(self, norm_target_func=None, *args, **kwds):
        '''
        the func must be the run() function in a poc class.
        '''
        def argsGenerator():
            func_args = {
                'options': self.options,
                'success': None,
                'poc_ret': {},
            }
            for seed in self.seed_iter:
                if norm_target_func:
                    func_args['options']['target'] = norm_target_func(seed.strip(), *args, **kwds)
                else:
                    func_args['options']['target'] = seed.strip()
                yield deepcopy(func_args)

        requests = threadpool.makeRequests(callable_=self.func2run,
                                           args_list = argsGenerator(),
                                           callback=self.cbSaveResult,
                                           exc_callback=self.cbHandleErr)
        [self.tp.putRequest(req) for req in requests]
        self.tp.wait()
        self.tp.dismissWorkers(100, do_join=True)
        return self.total_num, self.finished_num, self.err_num


if __name__ == '__main__':
    import time
    # run poc_id
    from poc_20140007 import MyPoc

    start_time = time.time()
    bt = BatchTest(seed_file='website.txt',
                   func2run=MyPoc.verify,
                   options=None,
                   result_file='result.txt',
                   thread_num=100,
                   verbose=True)
    bt.batchTest(norm_target_func=normalize_url, https=False)
    print 'total number: %d, finished number: %d, success number: %d, error number: %d'\
          % (bt.total_num, bt.finished_num, bt.success_num, bt.err_num)
    print 'cost %f seconds.' % (time.time() - start_time)
