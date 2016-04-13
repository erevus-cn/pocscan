from celery import task, platforms
from .scanner.arachni import arach
from .scanner.sqlc import sqli


platforms.C_FORCE_ROOT = True

@task()
def sql(reqid):
    check = sqli(reqid)
    return check.detail

@task()
def xss(reqid):
    arach(reqid)
