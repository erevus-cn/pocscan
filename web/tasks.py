# coding:utf-8
import gevent
from gevent.pool import Pool
from web.lib.utils import *
from pocscan.poc_launcher import Poc_Launcher
from celery import Celery, platforms

app = Celery()

# 允许celery以root权限启动
platforms.C_FORCE_ROOT = True

# 修改celery的全局配置
app.conf.update(
    CELERY_IMPORTS = ("tasks", ),
    BROKER_URL = 'amqp://guest:guest@localhost:5672/',
    CELERY_RESULT_BACKEND = 'db+mysql://root:123456@127.0.0.1:3306/pocscan',
    CELERY_TASK_SERIALIZER='json',
    CELERY_RESULT_SERIALIZER='json',
    CELERY_TIMEZONE='Asia/Shanghai',
    CELERY_ENABLE_UTC=True,
    BROKER_TRANSPORT_OPTIONS = {'visibility_timeout': 3600}, # 如果任务没有在 可见性超时 内确认接收，任务会被重新委派给另一个Worker并执行  默认1 hour.
    CELERYD_CONCURRENCY = 50 ,
    CELERY_TASK_RESULT_EXPIRES = 1200,  # celery任务执行结果的超时时间，我的任务都不需要返回结
    # BROKER_TRANSPORT_OPTIONS = {'fanout_prefix': True},       # 设置一个传输选项来给消息加上前缀
)

# 失败任务重启休眠时间300秒，最大重试次数5次
#@app.task(bind=True, default_retry_delay=300, max_retries=5)
@app.task(time_limit=3600)
def run_task_in_gevent(url_list, poc_file_dict):     # url_list 每个进程分配到一定量的url
    poc = Poc_Launcher()
    pool = Pool(100)
    for target in url_list:
        for plugin_type,poc_files in poc_file_dict.iteritems():
            for poc_file in poc_files:
                if target and poc_file:
                    target = fix_target(target)
                    pool.add(gevent.spawn(poc.poc_verify, target, plugin_type, poc_file))
    pool.join()