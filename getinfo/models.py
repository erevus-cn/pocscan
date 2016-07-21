# -*- coding: utf-8 -*-


from __future__ import unicode_literals
import json
from django.db import models


# Create your models here.


class hostScan(models.Model):
    hostName = models.CharField("HOST", max_length=100, unique=True)
    ip = models.GenericIPAddressField("IP", null=True)
    title = models.TextField('标题', default='', null=True)
    useCdn = models.BooleanField('是否使用CDN', default=False)
    address = models.CharField('物理位置', max_length=100, null=True)

    def __self__(self):
        return self.hostName


class portScAction(models.Model):
    target = models.TextField("HOST/IP", default='')
    command = models.TextField("COMMAND", default='')
    startm = models.DateTimeField("TIME ON START", auto_now_add=True)

    def __self__(self):
        return self.command


class portScan(models.Model):
    ip = models.GenericIPAddressField("HOST/IP", )
    psaId = models.ForeignKey(portScAction, on_delete=None)
    portNumber = models.IntegerField('端口', )
    server = models.CharField('SERVER', max_length=50, default='')
    product = models.CharField('PRODUCT', max_length=50, default='')
    version = models.TextField('VERSION', default='')

    def __self__(self):
        return self.ip

    def toJSON(self):
        import json
        return json.dumps(dict([(attr, getattr(self, attr)) for attr in [f.name for f in self._meta.fields]]))
