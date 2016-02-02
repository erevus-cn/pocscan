#!coding=utf-8

from django import forms
 
class ScanForm(forms.Form):
    domain = forms.CharField()
    poc_name = forms.CharField()
