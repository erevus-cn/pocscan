from django.db import models

class Result(models.Model):
    domain = models.TextField()
    poc_file = models.TextField()
    result = models.TextField()
    date =  models.DateTimeField(auto_now_add=True, blank=True)
    is_fixed = models.NullBooleanField (default=False)

    def __unicode__(self):
        return self.result

class Tasks_status(models.Model):
    domains = models.TextField()
    task_name = models.TextField()
    status = models.NullBooleanField (default=False)

    def __unicode__(self):
         return self.domains