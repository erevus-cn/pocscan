# coding:utf-8
import gevent
from gevent.pool import Pool
from web.lib.utils import *
from web.lib.crawler import MyCrawler, similarity
from pocscan.poc_launcher import Poc_Launcher
from celery import task
from .models import Req_list
from urlparse import urlparse


# 失败任务重启休眠时间300秒，最大重试次数5次
# @app.task(bind=True, default_retry_delay=300, max_retries=5)
@task(time_limit=3600)
def run_task_in_gevent(url_list, poc_file_dict):  # url_list 每个进程分配到一定量的url
    poc = Poc_Launcher()
    pool = Pool(100)
    for target in url_list:
        for plugin_type, poc_files in poc_file_dict.iteritems():
            for poc_file in poc_files:
                if target and poc_file:
                    target = fix_target(target)
                    pool.add(gevent.spawn(poc.poc_verify, target, plugin_type, poc_file))
    pool.join()


@task(time_limit=3600)
def crawler(target, cookie, ua):
    result = {}
    crawl_count = 5
    craw = MyCrawler(target, cookie, ua)
    craw.crawling(target, crawl_count)
    url_list = list(set(craw.linkQuence.getUnvisitedUrl() + craw.linkQuence.getVisitedUrl()))
    size = 1000000000
    for url in url_list:
        try:
            temp = {str(similarity(url, size)): url}
            result.update(temp)
        except Exception, e:
            print e
    for url in result.values():
        try:
            tmp = urlparse(url)
            Req_list(method="GET",
                     host=tmp.netloc,
                     uri=tmp.path,
                     url=url.encode("utf8"),
                     ua=ua,
                     cookie=cookie,
                     ).save()
        except Exception, e:
            pass
    return result
