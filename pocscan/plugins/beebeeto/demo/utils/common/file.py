#!/usr/bin/env python
# coding=utf-8

import os


def count_lines(file_path):
    '''
    author: windows2000
    function: count the number of lines in a file
    '''
    f = open(file_path, 'rbU')
    line_cnt = 0
    while True:
        buf = f.read(65536)
        if not buf:
            break
        line_cnt += buf.count('\n')
    return line_cnt


def split_file_by_line(in_file, split_num, out_dir='.', out_prefix=None):
    '''
    author: windows2000
    fuction: split file by line.
    args：
        infile: input file
        split_num: how many pieces to divide input file into
        outdir: the dir to store the output files
        out_prefix: the prefix of output files' name
    return:
        a list that contains the path of each output file.
    eg:
        split_file_by_line('./test.txt',
                           split_num=3,
                           out_dir='./out',
                           out_prefix='splited')
        returns a list:
        ['./out/splited_1.dat', './out/splited_2.dat', './out/splited_3.dat']
    '''
    if split_num == 1:
        return [in_file]

    os.mkdir(out_dir) if not os.path.isdir(out_dir) else None

    # create output files
    out_files = []  # to store output file paths
    out_file_objs = []  # to store output file objects
    if not out_prefix:
        out_prefix = os.path.basename(in_file).split('.')[0]
    for i in xrange(split_num):
        out_file = os.path.join(out_dir,
                                '%s_%d.dat' % (out_prefix, i + 1))
        out_files.append(out_file)
        out_file_objs.append(open(out_file, 'wb'))

    # write lines to output files
    total_line_num = count_lines(in_file)
    avg_line_num = total_line_num / split_num
    cur_line_num = 0
    for each_line in open(in_file, 'rbU'):
        index = cur_line_num / avg_line_num
        index = index if index < split_num else (split_num - 1)
        out_file_objs[index].write(each_line)
        cur_line_num += 1

    return out_files
