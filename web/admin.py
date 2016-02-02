from django.contrib import admin
from web import models

class ResultAdmin(admin.ModelAdmin):
    list_display = ('domain','poc_file','result',)

class Tasks_status(admin.ModelAdmin):
    pass

admin.site.register(models.Result, ResultAdmin)
admin.site.register(models.Tasks_status, Tasks_status)
