# -*- coding: utf-8 -*-

import re
from chtscan.chtscan import Scanner


class sqli(Scanner):
    def get_setting(self):
        self.scanner_exe = 'sqlmap'
        return dict(
            scanner_exe='/usr/share/sqlmap/sqlmap.py',
            out_dir='/tmp/',
        )

    def get_cmd(self):
        cmd = [
            self.get_setting()['scanner_exe'],
            "--batch",
            "-u", self.req.url,
            "-v", "0",
            "--level=2",
            "--disable-coloring",
            "--text-only",
            "--purge-output",
            "--user-agent", self.req.ua,
            "-o",
            "--crawl=0",
            "--output-dir", self.get_setting()['out_dir'],
        ]

        if self.req.referer:
            cmd.extend(("--referer", self.req.referer))

        if len(self.req.cookie) > 0:
            cmd.extend(["--cookie", "%s" % self.req.cookie])

        if self.req.method == "POST":
            cmd.extend(("--method", "POST"))
            if self.req.data:
                cmd.extend(("--data", self.req.data))

        return cmd

    def get_detail(self):
        self.vuln_type = "sqli"
        report = re.findall(r'\n    Payload:(.*?)\n', self.result[0])
        if len(report) == 0: return

        if len(self.req.cookie) > 0:
            report.append("Cookie: " + self.req.cookie)
        self.detail = report
