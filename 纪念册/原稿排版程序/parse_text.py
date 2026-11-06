#!/usr/bin/env python3
"""把原稿 TXT 拆成逐页结构（只做切分，不改任何文字）。

用法: python3 parse_text.py <原稿.txt> <输出.json>

识别规则：
- "P01｜标题" 开始新的一页；
- 章节标题（"第一章" + 下一行章名，或 "第三章｜章名"、"特别篇｜…"、"尾声｜…"）
  归到紧随其后的那一页，作为该页的章节开篇；
- 文件开头的稿件说明，以及章节之间单独出现的书名行，是原稿文档的分段标记，单独记录，不排入页面；
- P40 之后单独一行的《插画标题》及其配文，记为 P06–P07 插画配文；本地图片路径只记录，不排入页面。
"""
import json
import re
import sys

PAGE_RE = re.compile(r'^P(\d{2})｜(.+)$')
CH_INLINE_RE = re.compile(r'^(第[一二三四五六七八九十]章|特别篇|尾声)｜(.+)$')
CH_ALONE_RE = re.compile(r'^第[一二三四五六七八九十]章$')


def main():
    src, out = sys.argv[1], sys.argv[2]
    lines = [l.strip() for l in open(src, encoding='utf-8-sig').read().splitlines()]
    lines = [l for l in lines if l]                     # 空行只是段落分隔
    doc = {'doc_header': [], 'separators': [], 'pages': [], 'illustration_caption': None, 'refs': []}
    pages, cur, pending_ch = [], None, None
    i = 0
    while i < len(lines):
        l = lines[i]
        m = PAGE_RE.match(l)
        if m:
            cur = {'page': int(m.group(1)), 'title': m.group(2), 'chapter': pending_ch, 'paragraphs': []}
            pages.append(cur)
            pending_ch = None
        elif CH_INLINE_RE.match(l):
            mm = CH_INLINE_RE.match(l)
            pending_ch = {'label': mm.group(1), 'name': mm.group(2)}
        elif CH_ALONE_RE.match(l) and i + 1 < len(lines) and not PAGE_RE.match(lines[i + 1]):
            pending_ch = {'label': l, 'name': lines[i + 1]}
            i += 1
        elif cur is not None and cur['page'] == 40 and re.match(r'^《.+》$', l):
            cap = {'title': l, 'lines': []}
            i += 1
            while i < len(lines):
                t = lines[i]
                if re.match(r'^\d{10,}$', t) or re.match(r'^[A-Z]:\\', t):
                    doc['refs'].append(t)
                elif t != '配文：':
                    cap['lines'].append(t)
                i += 1
            doc['illustration_caption'] = cap
            break
        elif cur is None:
            doc['doc_header'].append(l)
        elif l == '幸好，故事还在继续' and i + 1 < len(lines) and (CH_INLINE_RE.match(lines[i + 1]) or CH_ALONE_RE.match(lines[i + 1])):
            doc['separators'].append({'after_page': cur['page'], 'text': l})
        else:
            cur['paragraphs'].append(l)
        i += 1
    doc['pages'] = pages
    nums = [p['page'] for p in pages]
    assert nums == list(range(1, 41)), f'页码异常: {nums}'
    json.dump(doc, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('页数', len(pages), '| 稿件说明', doc['doc_header'], '| 分段标记', doc['separators'])
    for p in pages:
        ch = f"〔{p['chapter']['label']}｜{p['chapter']['name']}〕" if p['chapter'] else ''
        print(f"P{p['page']:02d} {p['title']} {ch} 段落{len(p['paragraphs'])} 字数{sum(len(x) for x in p['paragraphs'])}")
    print('插画配文:', doc['illustration_caption'])
    print('引用:', doc['refs'])


if __name__ == '__main__':
    main()
