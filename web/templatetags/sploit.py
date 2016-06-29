import re
from django import template

register = template.Library()

@register.filter(name="sp")
def sp(pocpath):
    try:
        pocname = re.findall(r"/([-\w]+)\.py", pocpath)[0]
    except Exception, e:
        pocname = "LOAD ERROR"
    return pocname

@register.filter(name="geturl")
def geturl(args):
    try:
        targeturl = re.findall(r'\'(.*?)\'', args)[0]
    except Exception, e:
        targeturl = "LOAD ERROR"
    return targeturl
