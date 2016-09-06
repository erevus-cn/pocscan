# coding=utf-8
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.decorators import login_required
from pocscan.library.utils import get_poc_files
from pocscan.config import PLUGINS_SUPPORT
from pocscan.config import POCS_DIR
from web.lib.utils import check_status
from web.lib.task_control import Task_control
from web.models import Result, Req_list
from web.tasks import crawler
from chtscan.tasks import sql
from pocscanui.settings import FLOWER_API
from urlparse import urlparse
import os

import json
import requests as req


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
        mode = int(request.POST.get('mode', 1))

        targets = list(set(domains.split(',')))
        tmp_targets = list(set(domains.split(',')))
        # 已有数据或者在扫描的目标不进行扫描
        if mode == 0:
            for target in tmp_targets:
                cannt_scan_target, status = check_status(target)
                if cannt_scan_target:
                    targets.remove(cannt_scan_target)
            if targets:
                Task_control().launch(targets, poc_name, task_name)
                return JsonResponse({"status": 200})
            else:
                return JsonResponse({"status": 1})
        else:
            cookie = request.POST.get('cookie', "")
            ua = request.POST.get('ua',
                                  "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36")
            if targets:
                for target in targets:
                    # 放爬虫
                    crawler.delay(target, cookie, ua)
                    return JsonResponse({"status": 200})
            else:
                return JsonResponse({"status": 1})


@csrf_exempt
def scancheck(request):
    module = request.POST.get('module')
    if module == 'pocscan':
        domains = str(request.POST.get('domains', "bilibili.com"))
        targets = list(set(domains.split(',')))
        tmp_targets = list(set(domains.split(',')))
        for target in tmp_targets:
            cannt_scan_target, status = check_status(target)
            if cannt_scan_target:
                targets.remove(cannt_scan_target)
        if targets:
            Task_control().launch(targets, "", "")
            return JsonResponse({"status": 200})
        else:
            return JsonResponse({"status": 1})
    elif module == 'sqlmap':
        chromeapi(request)
    else:
        return JsonResponse({'status': "error"})
    return JsonResponse({'status': "200"})


@csrf_exempt
def chromeapi(request):
    method = request.POST.get('method')
    url = request.POST.get('url')
    cookie = request.POST.get('cookie', '')
    ua = request.POST.get('ua', '')
    referer = request.POST.get('referer', '')
    data = request.POST.get('data', '')
    tmparse = urlparse(url)
    host = tmparse.netloc
    uri = tmparse.path
    white_list = ['', '.php', 'cgi',
                  '.asp', '.aspx', 'ashx',
                  '.do', '.action', 'jsp',
                  '.html', 'htm', '.shtml', '.stm', '.shtm',
                  'json',
                  ]

    try:
        file_type = os.path.splitext(uri.replace('//', '/'))[1]
        if file_type in white_list:
            req = Req_list(method=method,
                           url=url,
                           host=host,
                           uri=uri,
                           data=data,
                           referer=referer,
                           ua=ua,
                           cookie=cookie,
                           )
            req.save()
            sql.delay(req.id)
            return JsonResponse({"status": req.id})
        else:
            return JsonResponse({"status": "haved in the reqlist"})
    except Exception, e:
        return JsonResponse({"status": "error"})


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


@login_required(login_url="/login/")
def index(request):
    return render(request, 'index.html')


@login_required(login_url="/login/")
def monitor(request):
    running_task = []
    try:
        url = FLOWER_API + '/tasks?limit=10&state=STARTED'
        tasks = json.loads(req.get(url).content)
        for tid in tasks.iterkeys():
            running_task.append(tasks[tid])
        return render(request, 'monitor.html', {"running_task": running_task})
    except Exception, e:
        return HttpResponse('flower is not running')


@login_required(login_url="/login/")
def results(request):
    try:
        page = (int(request.GET['page']) - 1) * 10
        try:
            results = Result.objects.all()[::-1]
            results = results[page:(page + 10)]
            return render(request, 'reslist.html', {"results": results})
        except Exception, e:
            pass
    except Exception, e:
        numOfResult = len(Result.objects.all())
        return render(request, 'results.html', {"num": numOfResult})


@login_required(login_url="/login/")
def poc_list(request):
    poc_list = get_poc_files('')

    if request.method == 'GET':
        return render(request, 'poc_list.html', {"poc_list": poc_list, 'poc_supports': PLUGINS_SUPPORT})
    else:
        file_list = request.FILES.getlist('pocs[]')
        upload_dir = POCS_DIR + request.POST['catalogue'] + '/'
        try:
            for poc in file_list:
                ext = poc.name.split('.')[-1]
                if ext != u'py':
                    continue
                filename = upload_dir + poc.name
                with open(filename, 'wb') as tmp:
                    for chunk in poc.chunks():
                        tmp.write(chunk)
        except BaseException as error:
            return HttpResponse(error)
        ret_dict = {
            'poc_list': poc_list,
            'status': u"上传成功",
            'poc_supports': PLUGINS_SUPPORT
        }
        return render(request, 'poc_list.html', ret_dict)


@login_required(login_url="/login/")
def terminal(request):
    host = request.META['HTTP_HOST'].split(':')[0]
    return render(request, 'terminal.html', {"host": host})


@login_required(login_url="/login/")
def get_req(request):
    try:
        offset = int(request.GET['offset'])
        offend = int(request.GET['limit']) + offset
        try:
            scanhost = request.GET['search']
            infobj = Req_list.objects.filter(host=scanhost).values()
            info = list(infobj)
            return JsonResponse({"total": len(info), "rows": info})
        except Exception, e:
            infobj = Req_list.objects.values()
            allinfo = list(infobj)
            info = allinfo[offset:offend]
            return JsonResponse({"total": len(allinfo), "rows": info})
    except Exception, e:
        return JsonResponse({"total": "0", "rows": []})


@login_required(login_url="/login/")
def del_req(request):
    try:
        reqids = request.POST['reqid']
        reqids = reqids.split(',')
        for reqid in reqids:
            Req_list.objects.get(id=reqid).delete()
        return HttpResponse("Success")
    except Exception, e:
        return HttpResponse("Error")


@login_required(login_url="/login/")
def reqlist(request):
    return render(request, 'reqlist.html')


@login_required(login_url="/login/")
def sxcheck(request):
    try:
        reqids = request.POST['reqid']
        reqids = reqids.split(',')
        for reqid in reqids:
            sql.delay(reqid)
        return HttpResponse("Success")
    except Exception, e:
        return HttpResponse("Error")
