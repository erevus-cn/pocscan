#!/usr/bin/env python
# encoding: utf-8
# by wenshin

import sys
import argparse
import pocsuite

from .lib.ksprint import print_banner
from .net import custom_header
from .net.net_utils import init_proxy
from .env import add_cwd_to_path
from .utils import get_poc_object
from .check import check_poc_if_violation
from .lib.kslog import initLogging


_DESC = 'Operate all POCs or specified by POC IDs.'
_POC_HELP = 'the POC vul ID that want to run'
_ALL_HELP = ' all POCs in the directory [./pocs]'
_TEST_HELP = '''
    check the completeness of POC info.
    test POC using targets in [sample] field of instance of POC
'''
_MODE_HELP = '''
    verify vuln or attack it, \"v\" for verify and \"a\" for attack
'''
_VERBOSE_HELP = '''
    print more information or not, value is 1 or 0, default is 0
'''
_FORM_CRED_HELP = '''
    form authentication credentials (user=guest&pwd=123456)
'''
_PAYLOAD_HELP = '''
    the payload ( alert(1119) / phpinfo() / and 1=2  )
'''
_AUTH_TYPE_HELP = '''
    HTTP authentication type (Basic, Digest or NTLM)
'''
_AUTH_CRED_HELP = '''
    HTTP authentication credentials (name:password)
'''
_PROXY_HELP = '''
    support socks4,socks5,http (socks5://127.0.0.1:1080)
'''


class Grouped(argparse.Action):
    def __call__(self, parser, namespace, values, option_string=None):
        group, dest = self.dest.split('.', 2)
        groupspace = getattr(namespace, group, argparse.Namespace())
        setattr(groupspace, dest, values)
        setattr(namespace, group, groupspace)


def main():
    print_banner()
    args = parse_argv()
    add_cwd_to_path()
    initLogging()

    if getattr(args.params, 'proxy', None):
        init_proxy(args.params.proxy)
    poc = get_poc_object(args.poc)
    if check_poc_if_violation(poc, args.verbose):
        return
    headers = custom_header(args.headers.__dict__)
    if args.mode == 'examine':
        from .net.gevent_utils import gevent_examine
        gevent_examine(poc, args.file, headers, args.params)
    else:
        output = poc.execute(args.url, headers, args.params, mode=args.mode,
                             verbose=args.verbose)
        output.print_result()


def parse_argv():
    parser = argparse.ArgumentParser(description=_DESC)
    version = 'Pocsuite '+pocsuite.__version__
    parser.add_argument('--version', action='version', version=version)

    parser.add_argument(
        '-v', '--verbose',
        dest="verbose", action="store_true", help=_VERBOSE_HELP
    )

    # set params default value
    params = argparse.Namespace(url=None)
    # set headers default value
    headers = argparse.Namespace()
    namespace = argparse.Namespace(params=params, headers=headers)

    subparsers = parser.add_subparsers(help='sub-command help', dest='mode')
    verify_parser = subparsers.add_parser('verify', help='run poc with verify mode')
    verify_parser.add_argument(dest='poc', help='POC file')
    verify_parser.add_argument(dest="url", help="Target url")
    add_headers_args(verify_parser)
    add_extra_args(verify_parser)

    attack_parser = subparsers.add_parser('attack', help='run poc with attack mode')
    attack_parser.add_argument(dest='poc', help='POC file')
    attack_parser.add_argument(dest="url", help="Target url")
    add_headers_args(attack_parser)
    add_extra_args(attack_parser)
    
    examine_parser = subparsers.add_parser('examine', help='examine a poc with input a url file')
    examine_parser.add_argument(dest='poc', help='POC file')
    examine_parser.add_argument(dest="file", help="file within target urls")
    add_headers_args(examine_parser)
    add_extra_args(examine_parser)

    return parser.parse_args(namespace=namespace)


# the parameters for poc input
def add_extra_args(parser):
    extra_args = parser.add_argument_group('params', 'extra arguments for poc execution')
    extra_args.add_argument(
        "--form-action",
        action=Grouped, dest="params.form_action",
        default=argparse.SUPPRESS, help="Form action url"
    )
    extra_args.add_argument(
        "--form-cred",
        action=Grouped, dest="params.form_cred",
        default=argparse.SUPPRESS, help=_FORM_CRED_HELP
    )
    extra_args.add_argument(
        "--username",
        action=Grouped, dest="params.username",
        default=argparse.SUPPRESS, help="the username"
    )
    extra_args.add_argument(
        "--password",
        action=Grouped, dest="params.password",
        default=argparse.SUPPRESS, help="the password"
    )
    extra_args.add_argument(
        "--email", action=Grouped, dest="params.email",
        default=argparse.SUPPRESS, help="the email"
    )
    extra_args.add_argument(
        "--verify-code",
        action=Grouped, dest="params.verify_code",
        default=argparse.SUPPRESS, help="the verify code"
    )
    extra_args.add_argument(
        "--auth-type",
        action=Grouped, dest="params.auth_type",
        default=argparse.SUPPRESS, help=_AUTH_TYPE_HELP
    )
    extra_args.add_argument(
        "--auth-cred",
        action=Grouped, dest="params.auth_cred",
        default=argparse.SUPPRESS, help=_AUTH_CRED_HELP
    )
    extra_args.add_argument(
        "--payload",
        action=Grouped, dest="params.payload",
        default=argparse.SUPPRESS, help=_PAYLOAD_HELP
    )
    extra_args.add_argument(
        "--proxy",
        action=Grouped, dest="params.proxy",
        default=argparse.SUPPRESS, help=_PROXY_HELP
    )


def add_headers_args(parser):
    headers_group = parser.add_argument_group('headers', 'headers for request')
    headers_group.add_argument(
        '-c', '--cookie',
        action=Grouped, dest="headers.Cookie",
        default=argparse.SUPPRESS, help="HTTP Cookie field"
    )
    headers_group.add_argument(
        '-r', '--referer',
        action=Grouped, dest="headers.Referer",
        default=argparse.SUPPRESS, help="HTTP Referer field"
    )
    headers_group.add_argument(
        '-u', '--user-agent',
        action=Grouped, dest="headers.User-Agent",
        default=argparse.SUPPRESS, help="HTTP User-Agent field"
    )


if __name__ == '__main__':
    main()
