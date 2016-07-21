from celery import task, platforms
from .portinfo import portinfo
from .hostinfo import hostinfo

platforms.C_FORCE_ROOT = True


@task()
def port(ip, ports, args='-sV --open --min-rate=500'):
    portinfo(ip=ip, ports=ports, args=args)


@task()
def host(hostname):
    hostinfo(hostname)
