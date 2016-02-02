#author: fyth
import requests


class Webshell:
    _password = ''
    _content = ''
    _check_statement = ''
    _keyword = ''
    _check_data = {}

    def __init__(self, pwd='', content='', check='', keyword=''):
        if pwd:
            self._password = pwd
        if content:
            self._content = content
        if check:
            self._check_statement = check
        if keyword:
            self._keyword = keyword
        self._check_data[self._password] = self._check_statement

    def set_pwd(self, pwd):
        self._password = pwd

    def get_pwd(self):
        return self._password

    def get_content(self):
        return self._content.format(self._password)

    def check(self, url):
        try:
            content = requests.post(url, data=self._check_data, timeout=10).content
            return self._keyword in content
        except requests.Timeout:
            return False


class VerifyShell(Webshell):
    def __init__(self, content='', keyword=''):
        Webshell.__init__(self, content=content, keyword=keyword)
        self._check_data = {}
