from django.contrib import admin

# Register your models here.

from .models import hostScan, portScan

admin.site.register(hostScan)
admin.site.register(portScan)
