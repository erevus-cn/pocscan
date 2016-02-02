#!/usr/bin/env python
# coding=utf-8


from random import choice, randint


def rand_port(start=1025, stop=65535):
    '''
    author: windows2000
    fucntion:
        generate a random ip address.

        p.s. port range: 0 ~ 65535
    '''
    if stop < 0 or stop > 65535:
        raise Exception('error: wrong port range! shoud be 0 ~ 65535.')
    if stop < start:
        raise Exception('error: stop is less than start!')
    return randint(start, stop)


def rand_ip(local=None):
    '''
    author: windows2000
    function:
        generate a random ip address.

        the values of 'local' means:
            None - randomly generate ip address(internet or intranet)
            True - randomly generate intranet ip address
            False - randomly generate internet ip address

        p.s. intranet ip addresses:
            10.0.0.0 ~ 10.255.255.255
            172.16.0.0 ~ 172.31.255.255
            192.168.0.0 ~ 192.168.255.255
    '''
    # randomly generate ip address(internet or intranet)
    if local is None:
        return '%d.%d.%d.%d' % (randint(0, 255),
                                randint(0, 255),
                                randint(0, 255),
                                randint(0, 255))

    # randomly generate intranet ip address
    elif local is True:
        ip_seg1 = choice([10, 172, 192])
        if ip_seg1 == 10:
            ip_seg2 = randint(0, 255)
        elif ip_seg1 == 172:
            ip_seg2 = randint(16, 31)
        elif ip_seg1 == 192:
            ip_seg2 = 168
        return '%d.%d.%d.%d' % (ip_seg1,
                                ip_seg2,
                                randint(0, 255),
                                randint(0, 255))

    # randomly generate internet ip address
    elif local is False:
        ip_seg1 = randint(0, 255)
        ip_seg2 = randint(0, 255)
        if ip_seg1 == 10:
            return rand_ip(local=False)  # regenerate
        elif (ip_seg1 == 172) and (ip_seg2 in xrange(16, 32)):
            return rand_ip(local=False)  # regenerate
        elif ip_seg1 == 192 and ip_seg2 == 168:
            return rand_ip(local=False)  # regenerate
        return '%d.%d.%d.%d' % (ip_seg1,
                                ip_seg2,
                                randint(0, 255),
                                randint(0, 255))
