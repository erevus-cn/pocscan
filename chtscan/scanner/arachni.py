# -*- coding: utf-8 -*-

import datetime
import time
import urllib
import os
import json
import subprocess
from chtscan.chtscan import Scanner

class arach(Scanner):
    def get_setting(self):
        self.scanner_exe = 'arachni'
        return dict(
            scanner_exe = '/usr/share/arachni/bin/arachni',
            process_timeout = 180,
            out_dir = '/tmp/',
        )

    def get_cmd(self):
        timeout = str(datetime.timedelta(seconds=(self.get_setting()['process_timeout']-5)))
        self.outfile = self.get_setting()['out_dir'] + str(time.time())
        cmd = [
            self.get_setting()['scanner_exe'],
            "--checks", "code_injection*,file_inclusion*,path_traversal*,rfi*,xss*,xxe*", # "xss*",
			"--output-only-positives",
			"--http-request-concurrency", "1",
			"--http-request-timeout", "10000",
			"--timeout", timeout, #"00:03:00",
			"--scope-dom-depth-limit", "0",
			"--scope-directory-depth-limit", "0",
			"--scope-page-limit", "1",
			"--report-save-path", self.outfile,
			"--snapshot-save-path", "/dev/null",
            "--http-user-agent", "Mozilla/5.0 (Windows NT 6.3; rv:36.0) Gecko/20100101 Firefox/36.04",
        ]

        if self.req.referer:
            cmd.extend(['--http-request-header', 'Referer=%s' % self.req.referer])

        if len(self.req.cookie) > 0:
            cmd.extend(["--http-cookie-string", "%s" % self.req.cookie])

        cmd.append(self.req.url)

        return cmd

    def get_detail(self):
        self.vuln_type = 'xss'
        if not os.path.isfile(self.outfile):
            return

        json_file = self.outfile + '.json'

        cmd = ['/usr/bin/arachni_reporter', '--reporter', "json:outfile=%s" % json_file, self.outfile]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        out, err = process.communicate()

        if err:
            return

        if not os.path.isfile(json_file):
            return

        with open(json_file, 'r') as fil:
            jsn = fil.read()

        report = []
        try:
            report = json.loads(jsn)
        except Exception,e:
            print e

        issues = report['issues']
        for i in issues:
            ref = i['references']['OWASP'] if i['references'] and 'OWASP' in i['references'] else "N/A"
            req = None

            if 'request' in i:
                req = i['request']
            elif 'variations' in i and len(i['variations']) > 0:
                req = i['variations'][0]['request']


            fields = (i['name'], ref, i['severity'], req['headers_string'] if req else "N/A")
            descr = "D E T A I L S\n\nName:       %s\nReference:  %s\nSeverity:   %s\n\n\nR E Q U E S T\n\n%s" % fields

            if req and req['method'] == "post":
                descr += "%s" % urllib.urlencode(req['body'])

            self.detail = descr
