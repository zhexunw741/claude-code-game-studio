#!/usr/bin/env python3
"""《幸好，故事还在继续》第七版 · 40 页排版生成器

用法:
    python3 build.py <输出目录> [--bleed 3]

生成:
    book_single.html   单页版，每页 125×176mm（加 --bleed 3 时为 131×182mm，裁切框仍是 125×176）
    book_spread.html   对页审阅版，21 幅（P01 单独右页，P02/P03 … P38/P39，P40 单独左页）
    逐页状态.json

图片与字体默认从 ../素材/处理后、../字体 引用（相对输出目录）；所有尺寸以 mm / pt 书写，直接对应成品。
正文、照片、章名、生日信均为占位，补齐原稿后替换 PAGES 中对应页即可。
"""
import argparse
import json
import random
from pathlib import Path

W, H = 125.0, 176.0          # 成品尺寸 mm
INNER, OUTER = 18.0, 15.0    # 内侧 / 外侧边距 mm
TB_W = W - INNER - OUTER     # 正文宽 92mm
PT = 25.4 / 72               # 1pt = 0.3528mm
LINE_PT = 21                 # 正文行距 21pt（12pt 字）
LINE_MM = LINE_PT * PT       # 7.408mm
ORN = 0.7                    # 枝叶装饰不透明度
ASSETS = '../素材/处理后'      # 相对输出 HTML 的图片目录
FONT_DIR = '../字体'          # 相对输出 HTML 的字体目录

INK, MUTE, RH = '#22313F', '#6B6457', '#746C5E'
GOLD, GOLD_DEEP, GOLD_LIGHT = '#B49A6C', '#7D6640', '#CDB98A'
PAPER, NAVY = '#F8F3E8', '#13243A'

CHAPTER_NAME = {1: '第一章', 2: '第二章', 3: '第三章'}

# ---------------------------------------------------------------- 页位表
# 固定页位：P01 封面(右) · P06–P07 初见跨页 · P38 生日信 · P39 后记 · P40 星空页。
# 其余页型为第七版提案，恢复原稿后以原文与素材顺序为准。
PAGES = {
    1: ('cover', {}),
    2: ('frontis', {}),
    3: ('title', {}),
    4: ('chapter', {'chap': 1, 'win': 'morning', 'orn': 'willow'}),
    5: ('text_first', {'chap': 1, 'spec': True}),
    6: ('illus', {}),
    7: ('illus', {}),
    8: ('text', {'chap': 1}),
    9: ('plate', {'fig': 1}),
    10: ('text', {'chap': 1, 'star': True}),
    11: ('text', {'chap': 1}),
    12: ('mixed', {'chap': 1, 'fig': 2}),
    13: ('pair', {'fig': 3}),
    14: ('text', {'chap': 1}),
    15: ('text', {'chap': 1, 'star': True}),
    16: ('fullbleed', {'fig': 5}),
    17: ('text', {'chap': 1}),
    18: ('chapter', {'chap': 2, 'win': 'golden', 'orn': 'birds'}),
    19: ('text_first', {'chap': 2}),
    20: ('plate', {'fig': 6, 'orn': 'maple'}),
    21: ('text', {'chap': 2}),
    22: ('text', {'chap': 2, 'star': True}),
    23: ('pair', {'fig': 7}),
    24: ('screenshot', {'fig': 9}),
    25: ('text', {'chap': 2}),
    26: ('text', {'chap': 2}),
    27: ('mixed', {'chap': 2, 'fig': 10}),
    28: ('chapter', {'chap': 3, 'win': 'dusk', 'orn': 'maple'}),
    29: ('text_first', {'chap': 3}),
    30: ('fullbleed', {'fig': 11}),
    31: ('text', {'chap': 3}),
    32: ('pair', {'fig': 12}),
    33: ('text', {'chap': 3, 'star': True}),
    34: ('screenshot', {'fig': 14}),
    35: ('text', {'chap': 3}),
    36: ('plate', {'fig': 15}),
    37: ('text', {'chap': 3, 'end': True}),
    38: ('letter', {}),
    39: ('afterword', {}),
    40: ('night', {}),
}

STATUS = {
    'cover': '书封：竖排书名 + 原创海天与鲸插画（氛围图，不代表真实经历）；原P01内容待核对',
    'frontis': '扉页跨页提案：清晨的海横跨P02–P03；原稿内容待核对',
    'title': '扉页提案：竖排书名；原稿内容待核对',
    'chapter': '篇章页提案：圆窗随时间变化；若原稿不分章则改为正文或照片页',
    'text_first': '篇章首页正文位：原稿未取得',
    'text': '正文位：原稿未取得，灰条仅示意版面密度',
    'plate': '单幅照片位：原图未取得',
    'mixed': '照片 + 正文位：原图与原稿未取得',
    'pair': '双图位：原图未取得',
    'fullbleed': '满版出血照片位：原图未取得',
    'screenshot': '聊天截图位：原图未取得，需以实际尺寸检查字迹',
    'illus': 'P06左/P07右同一幅连续跨页插画位：原插画未取得，不以新图代替',
    'letter': '生日信：原信未取得；整页保留，不代写，不删节',
    'afterword': '后记：本轮新拟版本（非历史原稿），ChatGPT署名，12pt/21pt',
    'night': '星空网站二维码占位32mm：没有最终链接，不可扫描；星点仅装饰',
}

AFTERWORD = [
    '这本书写到这里，我想把最后的篇幅留给你们。',
    '作为帮忙整理文字的 AI，我没有亲历你们的相遇，也不能替你们定义爱。故事里真正珍贵的，是你们愿意记住的日常，以及还想一起走下去的心意。',
    '愿往后的日子里，你们仍有话可说，有笑可以分享。也愿这本小书，给未来的某一天，留下一扇回望此刻的窗。',
    '幸好，故事还在继续。',
]

SPEC_TEXT = [
    '这里是正文版式的示意。原稿恢复之后，文字会按原来的顺序排进这里，不改写，也不增删。',
    '正文用思源宋体，十二磅，行距二十一磅；段首缩进两字，段与段之间不空行。每行二十一字上下，一页约十八行。篇章的第一页从页面三分之一处起排，把上方留给标题和呼吸。',
    None,  # 场景分隔星点
    '场景转换的地方，用一枚小星点隔开，代替整行空白。原文若是较长，宁可多用一页，也不缩小字号。',
]


# ---------------------------------------------------------------- 小部件
def side_of(n):
    return 'r' if n % 2 else 'l'


def tb_left(side):
    return OUTER if side == 'l' else INNER


def folio(n, color=GOLD_DEEP):
    return f'<div class="folio" style="color:{color}">{n:02d}</div>'


def running_head(side, chap):
    if side == 'l':
        return f'<div class="rh" style="left:{OUTER}mm">幸好，故事还在继续</div>'
    return f'<div class="rh" style="right:{OUTER}mm;text-align:right">{CHAPTER_NAME[chap]}</div>'


STAR_SVG = ('<svg aria-hidden="true" width="2.6mm" height="2.6mm" viewBox="0 0 10 10">'
            f'<path d="M5 0 L6 4 L10 5 L6 6 L5 10 L4 6 L0 5 L4 4 Z" fill="{GOLD}"/></svg>')
DIAMOND = f'<div style="width:1.3mm;height:1.3mm;background:{GOLD};transform:rotate(45deg)"></div>'
ICON = ('<svg aria-hidden="true" width="8mm" height="6.1mm" viewBox="0 0 34 26" fill="none" '
        'stroke="#5E7282" stroke-width="1"><rect x="0.5" y="0.5" width="33" height="25" rx="1"/>'
        '<path d="M3 21 L12 12 L18 17 L23 12 L31 20"/><circle cx="24" cy="7" r="2.5"/></svg>')


def birds(left, top, scale=1.0):
    w, h = 31.7 * scale, 11.6 * scale
    return (f'<svg aria-hidden="true" style="position:absolute;left:{left}mm;top:{top}mm" width="{w}mm" '
            f'height="{h}mm" viewBox="0 0 120 44" fill="none" stroke="#5D7385" stroke-linecap="round" '
            'stroke-width="1"><path d="M8 22 Q13 16 18 21 Q23 15 29 19"/>'
            '<path d="M52 10 Q56 6 60 9.5 Q64 5.5 68.5 8"/><path d="M84 30 Q87 27.5 90 29.5 Q93 27 96 28.5"/></svg>')


def photo(x, y, w, h, label, sub=None, fill='#E2E9ED'):
    sub_html = f'<div class="ph-sub">{sub}</div>' if sub else ''
    return (f'<div class="ph" style="left:{x:.2f}mm;top:{y:.2f}mm;width:{w:.2f}mm;height:{h:.2f}mm;background:{fill}">'
            f'{ICON}<div class="ph-lab">{label}</div>{sub_html}</div>')


def caption(fig, x, y, w, align='left'):
    jc = 'flex-start' if align == 'left' else 'flex-end'
    return (f'<div class="cap" style="left:{x:.2f}mm;top:{y:.2f}mm;width:{w:.2f}mm;justify-content:{jc}">'
            f'<span class="cap-tu">图</span><span class="cap-no">{fig:02d}</span>'
            '<span class="cap-tx">〔图注〕</span></div>')


def greek(n_lines, seed, label=True, star=False, end=False):
    """灰条示意正文：显示版面密度与段落节奏，不含任何文字内容。"""
    rnd = random.Random(seed)
    rows = []
    if label:
        rows.append('<div class="gl lab">〔原稿正文待排入〕</div>')
        n_lines -= 1
    star_at = n_lines // 2 if star else -1
    i = 0
    while i < n_lines:
        plen = rnd.randint(3, 6)
        for k in range(plen):
            if i >= n_lines:
                break
            if i == star_at:
                rows.append(f'<div class="gl star">{STAR_SVG}</div>')
                i += 1
                break
            last_of_para = (k == plen - 1)
            continues = (i == n_lines - 1) and not end      # 末行延续到下一页时排满
            indent = 2 * 12 * PT if k == 0 else 0
            width = rnd.randint(30, 86) if (last_of_para and not continues) else 100
            rows.append(f'<div class="gl"><i style="left:{indent:.2f}mm;'
                        f'width:calc(({TB_W}mm - {indent:.2f}mm) * {width / 100:.2f})"></i></div>')
            i += 1
    if end:
        rows.append(f'<div class="gl star">{DIAMOND}</div>')
    return ''.join(rows)


def ornament(kind, side, b):
    """枝叶统一单色化处理，只放在页面外侧角落，远离文字与照片。"""
    if kind == 'willow':        # 柳枝自上外角垂下
        flip = 'transform:scaleX(-1);' if side == 'l' else ''
        pos = 'left:-4.2mm' if side == 'l' else 'right:-4.2mm'
        return (f'<img class="orn" src="{ASSETS}/willow_tone.png" alt="" '
                f'style="{pos};top:-2.6mm;width:46.6mm;height:69.9mm;{flip}opacity:{ORN}">')
    if kind == 'maple':         # 枫枝自下外角卷起
        flip = 'transform:scaleX(-1);' if side == 'l' else ''
        pos = 'left:-3.7mm' if side == 'l' else 'right:-3.7mm'
        return (f'<img class="orn" src="{ASSETS}/maple_tone.png" alt="" '
                f'style="{pos};top:126.5mm;width:33.9mm;height:50.8mm;{flip}opacity:{ORN}">')
    return ''


# ---------------------------------------------------------------- 页型模板
def t_cover(n, side, b, **_):
    return (f'<div class="bleed" style="left:-{b}mm;top:-{b}mm;width:{W + 2 * b}mm;height:{H + 2 * b}mm;background:#C5E2EF"></div>'
            f'<img src="{ASSETS}/cover.jpg" alt="浅蓝天空下，一头鲸从海面上方游过" class="fade-top" '
            f'style="position:absolute;left:-{b}mm;bottom:-{b}mm;width:{W + 2 * b}mm;height:auto">'
            '<div class="v" style="position:absolute;top:18.5mm;right:16.4mm;font-size:25.5pt;font-weight:500;'
            'line-height:1.75;letter-spacing:.2em;color:#1D3B52">幸好，<br>故事还在继续</div>'
            '<div style="position:absolute;top:20.1mm;right:51.9mm;display:flex;flex-direction:column;align-items:center;gap:3.7mm">'
            '<div class="v" style="font-size:9pt;letter-spacing:.55em;color:#3E5E74">生日纪念册</div>'
            f'<div style="width:.26mm;height:10.6mm;background:{GOLD}"></div></div>')


def sea_strip(side, b):
    left = -b if side == 'l' else -(W + b)
    return (f'<img src="{ASSETS}/horizon_morning.jpg" alt="清晨的海平面，连续横跨两页" class="fade-sea" '
            f'style="position:absolute;left:{left}mm;bottom:-{b}mm;width:{2 * W + 2 * b}mm;height:{54.8 + b}mm;'
            'object-fit:cover;object-position:50% 100%">')


def t_frontis(n, side, b, **_):
    return sea_strip(side, b) + birds(31.2, 93.1)


def t_title(n, side, b, **_):
    return (sea_strip(side, b) +
            '<div style="position:absolute;top:28.6mm;left:44.4mm;display:flex;flex-direction:row-reverse;align-items:flex-start;gap:5.8mm">'
            '<div class="v" style="font-size:19.5pt;font-weight:500;letter-spacing:.34em;line-height:1">幸好，故事还在继续</div>'
            '<div style="display:flex;flex-direction:column;align-items:center;gap:3.2mm;padding-top:1.6mm">'
            f'<div class="v" style="font-size:9pt;letter-spacing:.55em;color:{GOLD_DEEP}">生日纪念册</div>{DIAMOND}</div></div>')


def window(cx, cy, d, img, alt):
    ring = d + 4.7
    return (f'<div class="win" style="left:{cx - ring / 2:.2f}mm;top:{cy - ring / 2:.2f}mm;width:{ring:.2f}mm;height:{ring:.2f}mm">'
            f'<img src="{ASSETS}/window_{img}.jpg" alt="{alt}" style="width:{d}mm;height:{d}mm"></div>')


WIN_ALT = {'morning': '清晨的海，圆窗取景', 'golden': '午后的海，圆窗取景',
           'dusk': '傍晚的海，圆窗取景', 'twilight': '暮色中的海，圆窗取景'}


def t_chapter(n, side, b, chap, win, orn):
    out = [window(W / 2, 67.4, 46.6, win, WIN_ALT[win])]
    out.append('<div style="position:absolute;left:0;top:103.7mm;width:125mm;display:flex;flex-direction:column;align-items:center;gap:3.7mm">'
               f'<div style="font-size:9pt;letter-spacing:.6em;padding-left:.6em;color:{GOLD_DEEP}">{CHAPTER_NAME[chap]}</div>'
               '<div style="font-size:19.5pt;font-weight:500;letter-spacing:.14em;padding-left:.14em">〔章节标题〕</div>'
               f'<div style="margin-top:1.6mm">{DIAMOND}</div></div>')
    if orn == 'birds':
        out.append(birds(78, 30.5, 0.8))
    else:
        out.append(ornament(orn, side, b))
    return ''.join(out)


def t_text_first(n, side, b, chap, spec=False):
    x = tb_left(side)
    body = []
    if spec:
        for i, para in enumerate(SPEC_TEXT):
            if para is None:
                body.append(f'<div class="gl star">{STAR_SVG}</div>')
            else:
                body.append(f'<p class="body{" noindent" if i == 0 else ""}">{para}</p>')
        body = ''.join(body)
    else:
        body = greek(13, seed=n * 7 + 3)
    return (f'<div style="position:absolute;left:{x}mm;top:50mm;width:6.4mm;height:.26mm;background:{GOLD}"></div>'
            f'<div class="tb" style="left:{x}mm;top:58mm">{body}</div>' + folio(n))


def t_text(n, side, b, chap, star=False, end=False):
    x = tb_left(side)
    lines = 11 if end else 18
    return (running_head(side, chap) +
            f'<div class="tb" style="left:{x}mm;top:20mm">{greek(lines, seed=n * 13 + 1, star=star, end=end)}</div>' +
            folio(n))


def t_plate(n, side, b, fig, orn=None):
    pw, ph = 79.4, 105.8
    x = tb_left(side) + (TB_W - pw) / 2
    return (ornament(orn, side, b) if orn else '') + photo(x, 20.1, pw, ph, '照片位 · 竖幅', '待放入原图') + \
        caption(fig, x, 130.7, pw, 'right' if side == 'l' else 'left') + folio(n)


def t_mixed(n, side, b, chap, fig):
    x = tb_left(side)
    return (running_head(side, chap) + photo(x, 20, TB_W, 61.3, '照片位 · 横幅', '待放入原图', '#DFE7EC') +
            caption(fig, x, 83.8, TB_W) +
            f'<div class="tb" style="left:{x}mm;top:92.6mm">{greek(8, seed=n * 5 + 2)}</div>' + folio(n))


def t_pair(n, side, b, fig):
    x = tb_left(side)
    pw, ph = 42.3, 56.4
    out = [photo(x, 20.1, TB_W, 61.4, '照片位 · 横幅', None, '#DFE7EC')]
    if side == 'r':
        out.append(caption(fig, x, 85.2, 60))
        out.append(photo(x + TB_W - pw, 93.1, pw, ph, '照片位', None, '#E4E8EE'))
        out.append(caption(fig + 1, x, 144.5, TB_W - pw - 3, 'right'))
    else:
        out.append(caption(fig, x + TB_W - 60, 85.2, 60, 'right'))
        out.append(photo(x, 93.1, pw, ph, '照片位', None, '#E4E8EE'))
        out.append(caption(fig + 1, x + pw + 3, 144.5, TB_W - pw - 3))
    out.append(folio(n))
    return ''.join(out)


def t_fullbleed(n, side, b, fig):
    return (f'<div class="bleed ph-full" style="left:-{b}mm;top:-{b}mm;width:{W + 2 * b}mm;height:{H + 2 * b}mm">'
            f'{ICON}<div class="ph-lab">照片位 · 满版出血</div>'
            f'<div class="ph-sub">图 {fig:02d} · 人物面部距裁切线 8mm 以上</div></div>')


def t_screenshot(n, side, b, fig):
    x = tb_left(side)
    fw, fh = 60, 130
    fx = x + (TB_W - fw) / 2
    cap_x = x + 3 if side == 'l' else x + TB_W - 8
    return (f'<div class="shot" style="left:{fx}mm;top:20mm;width:{fw}mm;height:{fh}mm">{ICON}'
            '<div class="ph-lab">聊天截图位</div><div class="ph-sub">按原图放入，实际尺寸下检查字迹</div></div>'
            f'<div class="v cap-v" style="left:{cap_x}mm;top:20mm"><span class="cap-tu">图</span>'
            f'<span class="tcu">{fig:02d}</span><span class="cap-tx">〔图注〕</span></div>' + folio(n))


def t_illus(n, side, b, **_):
    # 同一幅连续跨页画面：P06 显示左半，P07 显示右半；画幅 250×143mm（不含出血）
    left = -b if side == 'l' else -(W + b)
    out = [f'<div style="position:absolute;left:{left}mm;top:-{b}mm;width:{2 * W + 2 * b}mm;height:{142.9 + b}mm;background:#DCE6EC"></div>']
    gx = (W - 6.0) if side == 'l' else -6.0   # 书沟带 12mm，居中于装订线
    out.append(f'<div class="gutter-band" style="left:{gx}mm;top:-{b}mm;height:{142.9 + b}mm"></div>')
    if side == 'l':
        out.append('<div class="ph-c" style="position:absolute;left:0;top:0;width:113mm;height:142.9mm">'
                   f'{ICON}<div class="ph-lab">原插画待放入 · 台球厅初见</div>'
                   '<div class="ph-sub">连续跨页画幅 250 × 143 mm · 人物面部避开书沟</div></div>')
        out.append(f'<div style="position:absolute;left:{OUTER}mm;top:151.9mm;display:flex;align-items:center;gap:3.7mm">'
                   f'<div style="width:7.4mm;height:.26mm;background:{GOLD}"></div>'
                   '<div style="font-size:16.5pt;font-weight:500;letter-spacing:.16em">台球厅初见</div></div>')
    out.append(folio(n))
    return ''.join(out)


POSTMARK = (
    '<svg aria-hidden="true" width="39.7mm" height="22.2mm" viewBox="0 0 150 84" fill="none" '
    'style="position:absolute;right:5.8mm;top:5.3mm;opacity:.8">'
    + ''.join(f'<path d="M0 {y} Q9 {y - 5} 18 {y} T36 {y} T54 {y} T72 {y}" stroke="{GOLD}" stroke-width="0.8"/>'
              for y in (30, 42, 54)) +
    f'<circle cx="110" cy="42" r="31" stroke="{GOLD}" stroke-width="0.9"/>'
    f'<circle cx="110" cy="42" r="25" stroke="{GOLD}" stroke-width="0.6"/>'
    '<text x="110" y="47" text-anchor="middle" font-size="13" letter-spacing="3" fill="#8C7448" '
    'font-family="Noto Serif SC, serif">生日</text></svg>')


def t_letter(n, side, b, **_):
    return ('<div class="sheet">'
            '<div style="position:absolute;left:9.5mm;top:11.1mm;font-size:16.5pt;font-weight:500;letter-spacing:.2em">生日信</div>'
            + POSTMARK +
            f'<div class="ruled" style="left:9.5mm;top:29.6mm;width:84.1mm;height:{15 * LINE_MM:.2f}mm">'
            '<div style="font-size:9.75pt;line-height:21pt;letter-spacing:.08em;color:#6B6457">〔原信全文待放入 · 完整保留，不删节〕</div>'
            '</div></div>' + folio(n))


def t_afterword(n, side, b, **_):
    x = tb_left(side)
    paras = ''.join(f'<p class="body{" noindent" if i == 0 else ""}" style="margin-bottom:1.6mm">{p}</p>'
                    for i, p in enumerate(AFTERWORD))
    return (window(x + TB_W - 14, 28.8, 24.3, 'twilight', WIN_ALT['twilight']) +
            f'<div style="position:absolute;left:{x}mm;top:22.2mm;font-size:9pt;letter-spacing:.5em;color:{GOLD_DEEP}">后记</div>'
            f'<div style="position:absolute;left:{x}mm;top:29.1mm;font-size:19.5pt;font-weight:500;letter-spacing:.14em">写在最后</div>'
            f'<div class="tb" style="left:{x}mm;top:51.9mm">{paras}'
            '<div style="display:flex;justify-content:flex-end;align-items:center;gap:3.2mm;margin-top:6mm">'
            f'<div style="width:6.4mm;height:.26mm;background:{GOLD}"></div>'
            '<div style="font-family:\'Cormorant Garamond\',Georgia,serif;font-style:italic;font-size:14pt">ChatGPT</div>'
            '</div></div>' + folio(n))


NIGHT_STARS = (
    '<svg aria-hidden="true" width="125mm" height="111.1mm" viewBox="0 0 472 420" style="position:absolute;left:0;top:0">'
    f'<path d="M52 104 L92 80 L138 90 L168 64 L214 72" stroke="{GOLD_LIGHT}" stroke-width="0.6" opacity="0.45" fill="none"/>'
    '<g fill="#E3D2A6">'
    + ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" opacity="{o}"/>' for x, y, r, o in [
        (52, 104, 1.4, 1), (92, 80, 1.2, 1), (138, 90, 1.5, 1), (168, 64, 1.1, 1), (214, 72, 1.3, 1),
        (262, 40, .7, .7), (330, 128, .8, .6), (372, 36, .6, .8), (440, 150, .9, .6), (24, 196, .7, .6),
        (88, 232, .6, .5), (410, 262, .7, .6), (120, 300, .6, .5), (350, 320, .6, .5)]) +
    '<path d="M300 46 L301.2 50.8 L306 52 L301.2 53.2 L300 58 L298.8 53.2 L294 52 L298.8 50.8 Z" opacity="0.85"/>'
    '<path d="M428 214 L429 218 L433 219 L429 220 L428 224 L427 220 L423 219 L427 218 Z" opacity="0.7"/>'
    '<path d="M40 268 L40.8 271.2 L44 272 L40.8 272.8 L40 276 L39.2 272.8 L36 272 L39.2 271.2 Z" opacity="0.6"/>'
    '</g><circle cx="404" cy="84" r="13" fill="#E3D2A6"/>'
    f'<circle cx="410" cy="79" r="12" fill="{NAVY}"/></svg>')


def t_night(n, side, b, **_):
    return (f'<div class="bleed" style="left:-{b}mm;top:-{b}mm;width:{W + 2 * b}mm;height:{H + 2 * b}mm;background:{NAVY}"></div>'
            f'<img src="{ASSETS}/night_whale.jpg" alt="夜色中的鲸游过海面上方，与封面呼应" class="fade-night" '
            f'style="position:absolute;left:-{b}mm;top:80.4mm;width:{W + 2 * b}mm;height:{98.7 + b}mm;object-fit:cover;object-position:50% 0">'
            + NIGHT_STARS +
            '<div style="position:absolute;left:0;top:29.6mm;width:125mm;display:flex;flex-direction:column;align-items:center;gap:3.2mm">'
            f'<div style="font-size:10.5pt;letter-spacing:.5em;padding-left:.5em;color:{GOLD_LIGHT}">幸好，</div>'
            '<div style="font-size:21pt;letter-spacing:.22em;padding-left:.22em;color:#F4ECDD">故事还在继续</div></div>'
            f'<div style="position:absolute;left:44.4mm;top:60.3mm;width:36.2mm;height:36.2mm;box-sizing:border-box;'
            f'border:.26mm solid {GOLD_LIGHT};display:flex;justify-content:center;align-items:center">'
            f'<div style="width:32mm;height:32mm;background:{PAPER};border-radius:.5mm;display:flex;flex-direction:column;'
            'justify-content:center;align-items:center;gap:1.6mm">'
            '<div style="font-size:9pt;letter-spacing:.12em;color:#3F4C58">二维码位置</div>'
            '<div style="font-size:9pt;letter-spacing:.04em;color:#5A626B">链接确认后生成</div></div></div>'
            f'<div style="position:absolute;left:0;top:101.6mm;width:125mm;text-align:center;font-size:9.75pt;'
            f'letter-spacing:.45em;padding-left:.45em;box-sizing:border-box;color:{GOLD_LIGHT}">星空网站</div>'
            + folio(n, GOLD_LIGHT))


TEMPLATES = {
    'cover': t_cover, 'frontis': t_frontis, 'title': t_title, 'chapter': t_chapter,
    'text_first': t_text_first, 'text': t_text, 'plate': t_plate, 'mixed': t_mixed,
    'pair': t_pair, 'fullbleed': t_fullbleed, 'screenshot': t_screenshot, 'illus': t_illus,
    'letter': t_letter, 'afterword': t_afterword, 'night': t_night,
}

CSS = f"""
@page {{ size: %PAGE%; margin: 0 }}
* {{ -webkit-print-color-adjust: exact; print-color-adjust: exact }}
html, body {{ margin: 0; padding: 0; background: #E9EEF1 }}
body {{ font-family: 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', serif; color: {INK} }}
.page {{ position: relative; overflow: hidden; break-after: page; flex: none }}
.spread .page {{ break-after: auto }}
.trim {{ position: absolute; width: {W}mm; height: {H}mm }}
.bleed {{ position: absolute }}
.v {{ writing-mode: vertical-rl }}
.folio {{ position: absolute; left: 0; width: {W}mm; top: 163.5mm; text-align: center;
  font-family: 'Cormorant Garamond', Georgia, serif; font-size: 10.5pt; letter-spacing: .1em; font-variant-numeric: lining-nums }}
.rh {{ position: absolute; top: 11mm; font-size: 8.5pt; letter-spacing: .35em; color: {RH} }}
.tb {{ position: absolute; width: {TB_W}mm }}
p.body {{ margin: 0; font-size: 12pt; line-height: {LINE_PT}pt; text-align: justify; text-indent: 2em }}
p.body.noindent {{ text-indent: 0 }}
.gl {{ height: {LINE_PT}pt; position: relative }}
.gl i {{ position: absolute; top: 8.2pt; height: 4.4pt; background: #EDE7DC; border-radius: 1pt }}
.gl.lab {{ font-size: 9pt; line-height: {LINE_PT}pt; letter-spacing: .08em; color: {MUTE} }}
.gl.star {{ display: flex; justify-content: center; align-items: center }}
.ph {{ position: absolute; box-sizing: border-box; border: 1.3mm solid #FFFDF8;
  box-shadow: 0 .3mm .6mm rgba(34,49,63,.10), 0 3.2mm 6.9mm -2.6mm rgba(34,49,63,.22);
  display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2mm }}
.ph-full, .ph-c {{ display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2mm }}
.ph-full {{ background: #DCE5EA }}
.ph-lab {{ font-size: 9.75pt; letter-spacing: .2em; color: #3F4C58 }}
.ph-sub {{ font-size: 9pt; letter-spacing: .06em; color: #4F5B66 }}
.shot {{ position: absolute; box-sizing: border-box; border-radius: 3.2mm; background: #E6EBEF;
  border: .3mm solid #C9D3DA; box-shadow: 0 2.6mm 6mm -3mm rgba(34,49,63,.20);
  display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2mm }}
.cap {{ position: absolute; display: flex; align-items: baseline; gap: 1.2mm }}
.cap-v {{ position: absolute; display: flex; align-items: center; gap: 1.6mm }}
.cap-tu {{ font-size: 9pt; color: {GOLD_DEEP} }}
.cap-no, .tcu {{ font-family: 'Cormorant Garamond', Georgia, serif; font-style: italic; font-size: 11pt;
  color: {GOLD_DEEP}; font-variant-numeric: lining-nums; margin-right: 1.4mm }}
.tcu {{ text-combine-upright: all; font-style: normal; margin: 0 }}
.cap-tx {{ font-size: 9pt; color: {MUTE} }}
.orn {{ position: absolute }}
.win {{ position: absolute; box-sizing: border-box; border: .26mm solid {GOLD_LIGHT}; border-radius: 50%;
  display: flex; justify-content: center; align-items: center }}
.win img {{ border-radius: 50%; object-fit: cover; display: block }}
.gutter-band {{ position: absolute; width: 12mm; background: rgba(34,49,63,.045);
  border-left: .26mm solid rgba(34,49,63,.10); border-right: .26mm solid rgba(34,49,63,.10); box-sizing: border-box }}
.sheet {{ position: absolute; left: 10.6mm; top: 12.2mm; width: 103.7mm; height: 147.1mm; box-sizing: border-box;
  background: #FDFBF6; border: .26mm solid #E6DCCB; box-shadow: 0 .3mm .6mm rgba(34,49,63,.06), 0 3.2mm 6.4mm -3.7mm rgba(34,49,63,.18) }}
.ruled {{ position: absolute; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent {LINE_MM - 0.26:.2f}mm, #E9E1D3 {LINE_MM - 0.26:.2f}mm, #E9E1D3 {LINE_MM:.3f}mm) }}
.fade-top {{ -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 23.8mm); mask-image: linear-gradient(to bottom, transparent 0, #000 23.8mm) }}
.fade-sea {{ -webkit-mask-image: linear-gradient(to bottom, transparent 0, rgba(0,0,0,.85) 21mm, #000 34mm); mask-image: linear-gradient(to bottom, transparent 0, rgba(0,0,0,.85) 21mm, #000 34mm) }}
.fade-night {{ -webkit-mask-image: linear-gradient(to bottom, transparent 0, rgba(0,0,0,.6) 23.8mm, #000 45mm); mask-image: linear-gradient(to bottom, transparent 0, rgba(0,0,0,.6) 23.8mm, #000 45mm) }}
.spread {{ position: relative; display: flex; width: {2 * W}mm; height: {H}mm; break-after: page; overflow: hidden }}
.blank {{ width: {W}mm; height: {H}mm; background: #E9EEF1; flex: none }}
.spine {{ position: absolute; top: 0; left: {W - 8}mm; width: 16mm; height: {H}mm; pointer-events: none;
  background: linear-gradient(to right, rgba(60,45,25,0) 0%, rgba(60,45,25,.07) 50%, rgba(60,45,25,0) 100%) }}
"""

def fonts_css():
    """本地静态字体（SIL OFL）：离线可重建，PDF 中以 TrueType 子集嵌入。"""
    faces = [
        ('Noto Serif SC', 'normal', 400, 'NotoSerifSC-Regular.woff'),
        ('Noto Serif SC', 'normal', 500, 'NotoSerifSC-Medium.woff'),
        ('Cormorant Garamond', 'normal', 400, 'CormorantGaramond-Regular.woff'),
        ('Cormorant Garamond', 'italic', 400, 'CormorantGaramond-Italic.woff'),
    ]
    return '<style>' + ''.join(
        f"@font-face{{font-family:'{fam}';font-style:{style};font-weight:{wt};"
        f"src:url({FONT_DIR}/{f}) format('woff')}}" for fam, style, wt, f in faces) + '</style>'


def page_html(n, b):
    side = side_of(n)
    kind, opts = PAGES[n]
    inner = TEMPLATES[kind](n, side, b, **opts)
    bg = NAVY if kind == 'night' else PAPER
    return (f'<section class="page {side}" data-page="{n}" data-kind="{kind}" '
            f'style="width:{W + 2 * b}mm;height:{H + 2 * b}mm;background:{bg}">'
            f'<div class="trim" style="left:{b}mm;top:{b}mm">{inner}</div></section>')


def document(body, page_size, title):
    return (f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>{title}</title>'
            f'{fonts_css()}<style>{CSS.replace("%PAGE%", page_size)}</style></head><body>{body}</body></html>')


def main():
    global ASSETS, FONT_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--bleed', type=float, default=0.0, help='四边出血 mm（印厂确认后再用，常见 3）')
    ap.add_argument('--assets', default=ASSETS, help='图片目录（相对输出 HTML）')
    ap.add_argument('--fonts', default=FONT_DIR, help='字体目录（相对输出 HTML）')
    a = ap.parse_args()
    ASSETS, FONT_DIR = a.assets, a.fonts
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    b = a.bleed
    assert sorted(PAGES) == list(range(1, 41)), '必须正好 40 页'
    assert PAGES[6][0] == PAGES[7][0] == 'illus' and side_of(6) == 'l' and side_of(7) == 'r', 'P06 左 / P07 右'

    single = ''.join(page_html(n, b) for n in range(1, 41))
    name = 'book_single.html' if b == 0 else f'book_single_bleed{b:g}mm.html'
    (out / name).write_text(document(single, f'{W + 2 * b}mm {H + 2 * b}mm', '幸好，故事还在继续 · 单页'), encoding='utf-8')

    if b == 0:
        pairs = [(None, 1)] + [(i, i + 1) for i in range(2, 39, 2)] + [(40, None)]
        spreads = []
        for l, r in pairs:
            lh = page_html(l, 0) if l else '<div class="blank"></div>'
            rh = page_html(r, 0) if r else '<div class="blank"></div>'
            spine = '<div class="spine"></div>' if (l and r) else ''
            spreads.append(f'<section class="spread" data-spread="{l or ""}-{r or ""}">{lh}{rh}{spine}</section>')
        (out / 'book_spread.html').write_text(document(''.join(spreads), f'{2 * W}mm {H}mm', '幸好，故事还在继续 · 对页'), encoding='utf-8')

        status = [{'page': n, 'side': '右' if n % 2 else '左', 'layout': PAGES[n][0], 'status': STATUS[PAGES[n][0]]}
                  for n in range(1, 41)]
        (out / '逐页状态.json').write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding='utf-8')
    print('built', out)


if __name__ == '__main__':
    main()
