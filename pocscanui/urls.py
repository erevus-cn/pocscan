"""pocscanui URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/1.8/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  url(r'^$', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  url(r'^$', Home.as_view(), name='home')
Including another URLconf
    1. Add an import:  from blog import urls as blog_urls
    2. Add a URL to urlpatterns:  url(r'^blog/', include(blog_urls))
"""
from django.conf.urls import include, url
from django.contrib import admin

urlpatterns = [
    url(r'^admin/', include(admin.site.urls)),
    url(r'^$', 'web.views.index', name='home'),
    url(r'^login/$', 'django.contrib.auth.views.login', {'template_name': 'login.html'}),
    url(r'^logout/$', 'django.contrib.auth.views.logout', {'template_name': 'logout.html'}),
    url(r'^scan/', 'web.views.scan', name='scan'),
    url(r'^results/', 'web.views.results', name='results'),
    url(r'^monitor/', 'web.views.monitor', name='monitor'),
    url(r'^save_result', 'web.views.save_result', name='save_result'),
    url(r'^poc_list/', 'web.views.poc_list', name='poc_list'),
    url(r'^terminal/', 'web.views.terminal', name='terminal'),
    url(r'^admin/', include(admin.site.urls)),
    url(r'^getreq', 'web.views.get_req', ),
    url(r'^reqlist', 'web.views.reqlist', name='reqlist'),
    url(r'^delreq', 'web.views.del_req', ),
    url(r'^autocheck', 'web.views.sxcheck', ),
    url(r'^chromeapi', 'web.views.scancheck', ),
]
