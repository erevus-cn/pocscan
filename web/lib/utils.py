# coding:utf-8
from web.models import Result,Tasks_status

def check_status(target):
    """
    :param target:
    :return:
        status:1 目标都已有扫描结果或正在扫描
        status:200 可以去扫描
    """
    status = 200
    try:
        scanning_target = Tasks_status.objects.filter(domains__contains=target)
        scanned_target = Result.objects.filter(domain__contains=target)
        if scanning_target:
            status = 1
            return (target, status)
        elif scanned_target:
            status = 1
            return (target, status)
        else:
            return (False, status)
    except Exception,e :
        return (False, status)

def fix_target(domain, https=False):
    '''规范target信息'''
    if not domain:
        return
    elif domain.startswith(('http://', 'https://')):
        return domain
    if not https:
        domain = 'http://' + domain
    else:
        domain = 'https://' + domain
    return domain