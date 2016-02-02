#!/usr/bin/env python
# coding=utf8

import os

FRAMEWORK_DIR = os.path.abspath(os.path.join(os.path.abspath(__file__),
                                             '..',))

if __name__ == '__main__':
    print FRAMEWORK_DIR
