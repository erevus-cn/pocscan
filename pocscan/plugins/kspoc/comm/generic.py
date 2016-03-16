#!/usr/bin/env python
#coding=utf-8

"""
[ 部分小工具模块 ]
Author : 北北 @ Knownsec
[ output ]: 格式化输出 poc 返回的 io_info 字典
"""

def output(io_info):
	#print io_info
	outprint = ''

	if io_info['Status'] == 1: # 判断是否利用成功
		outprint += '[*] Success!\n'
	elif io_info['Status'] == 0:
		outprint += '[*] Failed! \n'
		if io_info['Error']:
			outprint += io_info['Error'] + '\n'

	if io_info['Verbose'] == 1: # 用户自定义需要打印详细信息
		outprint += '\n[*] Target: ' + io_info['URL'] + '\n' # 打印目标url
		if io_info['Mode'] == 'v': # 打印检测还是攻击
			outprint += '[*] Mode: %s\n' % 'Verify'
		elif io_info['Mode'] == 'a':
			outprint += '[*] Mode: %s\n' % 'Attack'

	if io_info['Status'] == 1:
		for r_key in io_info['Result']: # 打印io_info['Result']字典，请io_info['Result']一定为字典
			outprint += '\n[+] ' + r_key + '\n'
			for i in io_info['Result'][r_key]:
				outprint += '[*] ' + i + ': ' + io_info['Result'][r_key][i] + '\n'


	if io_info['Verbose'] == 1: 
		outprint += '\n[*] ...Done'
	return '\n' + outprint

def modify_headers(io_info):
	# 标准headers
	m_headers = {
	    'Accept':'*/*',
	    'Accept-Charset':'GBK,utf-8;q=0.7,*;q=0.3',
	    'Accept-Language':'zh-CN,zh;q=0.8',
	    'Cache-Control':'max-age=0',
	    'Connection':'keep-alive',
	    'Referer':'http://www.baidu.com',
	    'User-Agent':'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.52 Safari/537.17'
	}

	ua=io_info.get('X-User-Agent','')
	referer = io_info.get('X-Referer','')    
	cookie=io_info.get('X-Cookie','')
	if ua:
		m_headers['User-Agent'] = ua
	if referer:
		m_headers['Referer'] = referer
	if cookie:
		m_headers['Cookie'] = cookie
	else:
		m_headers['Cookie'] = ''
	return m_headers