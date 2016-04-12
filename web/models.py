from django.db import models


class Result(models.Model):
    domain = models.TextField()
    poc_file = models.TextField()
    result = models.TextField()
    date = models.DateTimeField(auto_now_add=True, blank=True)
    is_fixed = models.NullBooleanField(default=False)

    def __unicode__(self):
        return self.result


class Tasks_status(models.Model):
    domains = models.TextField()
    task_name = models.TextField()
    status = models.NullBooleanField(default=False)

    def __unicode__(self):
        return self.domains


class Req_list(models.Model):
    method = models.CharField('METHOD', max_length=5, )
    host = models.CharField('HOST', max_length=40, )
    uri = models.CharField('FILE', max_length=100, default='/', )
    url = models.TextField('URL', )
    referer = models.TextField('REFERER', null=True)
    data = models.TextField('REQUEST BODY', null=True)
    cookie = models.TextField('COOKIE', default='', )

    def __self__(self):
        return self.url
