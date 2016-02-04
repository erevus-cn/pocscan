# coding=utf-8
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from pocscan.library.utils import get_poc_files
from web.lib.utils import check_status
from web.lib.task_control import Task_control
from web.models import Result


import json

@login_required(login_url="/login/")
def index(request):
    return render(request, 'index.html')

@csrf_exempt
def scan(request):
    """
    :param request:
        domain: 127.0.0.1,erevus.me
        poc_name: struts;
        task_name: xxxx;
    :return:{
        status:1 目标都已有扫描结果或正在扫描
        status:200 可以去扫描
    """
    if request.method == 'POST':
        domains = str(request.POST.get('domains', "bilibili.com"))
        poc_name = request.POST.get('poc_name', "")
        task_name = request.POST.get('task_name', "")
        # mode = request.POST.get('mode', 1)

        targets = list(set(domains.split(',')))
        tmp_targets = list(set(domains.split(',')))
        # 已有数据或者在扫描的目标不进行扫描
        for target in tmp_targets:
            cannt_scan_target,status = check_status(target)
            if cannt_scan_target:
                targets.remove(cannt_scan_target)
        if targets:
            Task_control().launch(targets, poc_name, task_name)
            return JsonResponse({"status": 200})
        else:
            return JsonResponse({"status": 1})

@csrf_exempt
def save_result(request):
        try:
            target = request.POST.get('target', None)
            poc_file = request.POST.get('poc_file', None)
            result = request.POST.get('result', None)
            Result(domain=target, poc_file=poc_file, result=result).save()
            return JsonResponse({"status": 200, "result": result})
        except Exception, e:
            return JsonResponse({"status": e})

def results(request):
    try:
        page = (int(request.GET['page'])-1)*10
        try:
            results = Result.objects.all()[page:(page+10)]
            return render(request, 'reslist.html', {"results":results})
        except Exception,e:
            pass
    except Exception, e:
        return render(request, 'results.html')

def poc_list(request):
    poc_list = get_poc_files('')
    print poc_list
    return render(request, 'poc_list.html', {"poc_list":poc_list})

