# -*- coding: utf-8 -*-

from __future__ import unicode_literals
from web.models import Req_list, Result
import pipes
import subprocess


class Scanner(object):
    def __init__(self, requestid, ):
        self.req = Req_list.objects.filter(id=requestid)[0]
        self.scanner_exe = None
        self.vuln_type = None
        self.detail = "NO VULN"
        self.result = None
        self.cmd = self.get_cmd()

        self.exec_check()
        self.save_vuln()
        self.req.delete()

    def get_cmd(self):
        cmd = []
        return cmd

    def get_setting(self):
        return dict(
            scanner_exe="",
            out_dir="",
        )

    def save_vuln(self):
        self.get_detail()
        if self.detail != "NO VULN":
            vuln = Result(
                domain=self.req.url,
                result=self.detail,
                poc_file='Sqlmap',
            )
            vuln.save()
            self.detail = self.vuln_type + ": " + self.req.url

    def cmd_to_str(self):
        ecmd = [pipes.quote(o) for o in self.cmd]
        return " ".join(ecmd)

    def get_detail(self):
        pass

    def exec_check(self):
        process = subprocess.Popen(self.cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
        self.result = process.communicate()
