#!/usr/bin/env python
# coding=utf8
# author=evi1m0@201503
# poc: http://www.beebeeto.com/pdb/poc-2015-0052/
# install: https://pypi.python.org/pypi/ds_store

import sys

from ds_store import DSStore


if len(sys.argv) < 2:
    print '[*] Usage: %s path/.DS_Store' % sys.argv[0]
    sys.exit()

filelist = []
filename = sys.argv[1]
try:
    with DSStore.open(filename, 'r+') as obj:
            for i in obj:
                filelist.append(i.filename)
except Exception, e:
    print '[-] Error: %s' % str(e)
for name in set(list(filelist)):
    print '[*] ' + name
