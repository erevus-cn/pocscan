#!/usr/bin/env python
# coding=utf-8

"""
[ 命令行参数解析模块 ]
Author : 北北 @ Knownsec
说明：
传入一个 io_info 字典形如
io_info = {
          'URL'     : '',
          'Mode'    : 'v', # 默认值为 v 代表 verify
          'Verbose' : 0,   # 默认值为 0 代表不打印详细信息
          'Error'   : '',
          'Status'  : 0,   # 默认值为 0 代表poc没执行成功
          'Result'  : {}
          }
cmdline将对字典进行修改赋值，然后在poc中直接使用 io_info 这个字典即可

changelog:
2012/4/18
添加检查用户是否输入了协议如http开头，没有就添加上。
添加检查用户输入的待检测url是否以/结尾，如果有就去除，统一在poc里加。
2012/4/30
添加用户扩展输入参数的处理。
"""

import sys
from optparse import OptionError
from optparse import OptionParser

def main(io_info, usage='', argvs=[]):
	"""url、mode、verbose默认加载不需传入，
	其他参数名约定：

	"""
	if usage == '':
		usage = "python %s -u http://example.com [-m a] [-v]" % sys.argv[0]
	parser = OptionParser(usage=usage)

	try:
		parser.add_option("-u", "--url", dest="url", help="Target url")
		parser.add_option("-m", "--mode", dest="mode", default = 'v',  
		                  help="Verify vuln or attack it, \"v\" for verify and \"a\" for attack")
		parser.add_option("-v", "--verbose", dest="verbose", action="store_true", 
		                  help="Print more information or not, value is 1 or 0, default is 0")

		# 这里是用来加载扩展参数的，默认的三个不用if ，扩展参数参考这样if判断再参考add
		if 'cookie' in argvs:
			parser.add_option("--cookie", dest="cookie", help="HTTP Cookie header")
		if 'referer' in argvs: 
			parser.add_option("--referer", dest="referer", help="HTTP Referer header")
		if 'user-agent' in argvs: 
			parser.add_option("--user-agent", dest="user_agent", help="HTTP User-Agent header")
		if 'auth-type' in argvs: 
			parser.add_option("--auth-type", dest="auth_type", help="HTTP authentication type (Basic, Digest or NTLM)")
		if 'auth-cred' in argvs:
			parser.add_option("--auth-cred", dest="auth_cred", help="HTTP authentication credentials (name:password)")
		if 'form-action' in argvs: 
			parser.add_option("--form-action", dest="form_action", help="Form action url")
		if 'form-cred' in argvs: 
			parser.add_option("--form-cred", dest="form_cred", help="Form authentication credentials (user=guest&pwd=123456)")
		if 'payload' in argvs: 
			parser.add_option("--payload", dest="payload", default="alert(1119)", help="the payload ( alert(1119) / phpinfo() / and 1=2  )") 
		if 'username' in argvs: 
			parser.add_option("--username", dest="username", help="the username") 
		if 'password' in argvs: 
			parser.add_option("--password", dest="password", help="the password") 
		if 'email' in argvs: 
			parser.add_option("--email", dest="email", help="the email") 
		if 'verify-code' in argvs: 
			parser.add_option("--verify-code", dest="verify_code", help="the verify code") 

		(options, args) = parser.parse_args()		


		if not options.url:
			print '\n[*] No url input!\n'
			parser.print_help()
			sys.exit()

		io_info['URL'] = options.url
		if not io_info['URL'].startswith('http'):
			io_info['URL'] = 'http://' + io_info['URL']
		if io_info['URL'].endswith('/'):
			io_info['URL'] = io_info['URL'][:-1]

		if options.mode == 'a': 
			io_info['Mode'] = 'a' # 默认为 v，如果用户指定a则重新赋值

		if options.verbose: 
			io_info['Verbose'] = True # 默认为 False，如果用户输入了-v则重新赋值

		# 以下为执行poc之后会被修改覆盖的内容
		io_info['Error'] = '' # 没利用成功的原因，poc执行之后会覆盖此值
		io_info['Status'] = 0 # 默认为0，poc执行后会覆盖此值
		io_info['Result'] = {} # poc执行之后会覆盖此值，注意这是个字典

		'''从这里开始，后面都是特殊赋值'''
		if 'cookie' in argvs:
			if not options.cookie:
				print '\n[*] No cookie input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Cookie'] = options.cookie

		if 'referer' in argvs:
			if not options.referer:
				print '\n[*] No referer input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Referer'] = options.referer

		if 'user-agent' in argvs:
			if not options.user_agent:
				print '\n[*] No user-agent input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-User-Agent'] = options.user_agent

		if 'auth-type' in argvs:
			if not options.auth_type:
				print '\n[*] No auth-type input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Auth-Type'] = options.auth_type

		if 'auth-cred' in argvs:
			if not options.auth_cred:
				print '\n[*] No auth-cred input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Auth-Cred'] = options.auth_cred

		if 'form-action' in argvs:
			if not options.form_action:
				print '\n[*] No form-action input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Form-Action'] = options.form_action

		if 'form-cred' in argvs:
			if not options.form_cred:
				print '\n[*] No form-cred input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Form-Cred'] = options.form_cred

		if 'payload' in argvs:
			if options.payload: 
				io_info['X-Payload'] = options.payload  

		if 'username' in argvs:
			if options.username: 
				io_info['X-Username'] = options.username  

		if 'password' in argvs:
			if options.password: 
				io_info['X-Password'] = options.password  

		if 'email' in argvs:
			if options.email: 
				io_info['X-Email'] = options.email  

		if 'verify-code' in argvs:
			if not options.verify_code:
				print '\n[*] No verify-code input!\n'
				parser.print_help()
				sys.exit()
			io_info['X-Verify-Code'] = options.verify_code

	except (OptionError, TypeError), e:
		parser.error(e)