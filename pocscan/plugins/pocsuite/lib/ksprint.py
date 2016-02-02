#!/usr/bin/env python
# encoding: utf-8

from termcolor import cprint 

def print_success(message):
    cprint('[+] %s' % message, 'green')

def print_error(message):
    cprint('[!] %s' % message, 'red') 

def print_sysinfo(message):
    cprint('[*] %s' % message, 'cyan')

def print_info(meesage):
    cprint('%s' % meesage, 'white')

def print_banner():
    banner = '''                                          __
                                       __/\ \__
 _____     ___     ___    ____  __  __/\_\ \ ,_\    __
/\ '__`\  / __`\  /'___\ /',__\/\ \/\ \/\ \ \ \/  /'__`\\
\ \ \L\ \/\ \L\ \/\ \__//\__, `\ \ \_\ \ \ \ \ \_/\  __/
 \ \ ,__/\ \____/\ \____\/\____/\ \____/\ \_\ \__\ \____\\
  \ \ \/  \/___/  \/____/\/___/  \/___/  \/_/\/__/\/____/
   \ \_\\
    \/_/
=============================================================
'''
    cprint('%s' % banner, 'yellow')

