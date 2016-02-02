#!/usr/bin/env python
# coding=utf-8

import string


def hex_dump(buf):
    '''
    author: windows2000
    function: return the hexadecimal value of each character in buf
    '''
    output = ''
    buf_size = len(buf)

    for i in xrange(0, buf_size, 16):
        output += '%08x  ' % i

        for j in xrange(0, 16):
            if j == 8:
                output += ' '
            if i + j >= buf_size:
                output += '   '
            else:
                output += '%02x ' % ord(buf[i + j])

        output += ' '

        for j in xrange(0, 16):
            if i + j >= buf_size:
                output += ' '
            else:
                if (buf[i + j] in string.printable) and (not buf[i + j].isspace()):
                    output += '%c' % buf[i + j]
                else:
                    output += '.'

        output += '\n'
    return output