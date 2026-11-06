#!/usr/bin/env python3
"""《幸好，故事还在继续》正式排版生成器（原稿版）

用法:
    python3 build_book.py <pages.json> <输出目录> --config <排版配置.json> [--size 10] [--lead 16]

- 正文逐字取自 pages.json（由 parse_text.py 从原稿切分），不改写；一页原稿 = 一页成书。
- 图片从 IMG_DIR 引用（相对输出 HTML），字体从 FONT_DIR 引用；图片尺寸用 Pillow 读取。
- 输出 book_single.html（单页）与 book_spread.html（对页）。
"""
import argparse
import html
import json
from pathlib import Path

W, H = 125.0, 176.0
INNER, OUTER = 16.0, 13.0
TB_W = W - INNER - OUTER          # 96mm
TOP, BOTTOM = 15.0, 158.0         # 文字区上下界 mm
PT = 25.4 / 72
INK, MUTE, RH = '#22313F', '#6B6457', '#746C5E'
GOLD, GOLD_DEEP, GOLD_LIGHT = '#B49A6C', '#7D6640', '#CDB98A'
PAPER, NAVY = '#F8F3E8', '#13243A'
IMG_DIR = '../原始素材/图片'
DECO_DIR = '../素材/处理后'
FONT_DIR = '../字体'
ORN = 0.7
SIZE, LEAD = 10.0, 16.0           # 正文字号 / 行距（pt），由命令行覆盖

IMG = {}            # 图片键 → 文件名，从私有配置读取

# P39 特别后记与 P40 衔接稿均从私有文件读取（见配置 p39 / page_overrides），代码中不含任何正文。
P39CFG = {}         # {label, title, signature, paragraphs|None}
OVERRIDES = {}      # 页码 → 段落列表（经你确认的页面替换稿）

# 图片放置、装饰位置从私有配置 JSON 读取（含照片文件名与图注，不入公开仓库）。
# 格式见 README：placements {页码: {img, w, crop[x0,y0,x1,y1]|null, cap}}，ornaments {页码: birds|maple}，end_marks [页码]
PLACEMENTS, ORNAMENTS, END_MARKS = {}, {}, set()

E = html.escape


def side_of(n):
    return 'r' if n % 2 else 'l'


def tb_left(side):
    return OUTER if side == 'l' else INNER


def folio(n, color=GOLD_DEEP):
    return f'<div class="folio" style="color:{color}">{n:02d}</div>'


def diamond(size=1.2):
    return f'<span class="dia" style="width:{size}mm;height:{size}mm"></span>'


def cropped(img, crop, w_mm, natural):
    """按像素区域裁切图片，宽度 w_mm，返回 (html, 高度mm)。"""
    nw, nh = natural
    x0, y0, x1, y1 = crop or (0, 0, nw, nh)
    scale = w_mm / (x1 - x0)                    # mm/px
    h_mm = (y1 - y0) * scale
    return (f'<div class="crop" style="width:{w_mm:.2f}mm;height:{h_mm:.2f}mm">'
            f'<img src="{IMG_DIR}/{IMG[img]}" alt="" style="width:{nw * scale:.2f}mm;height:{nh * scale:.2f}mm;'
            f'left:{-x0 * scale:.2f}mm;top:{-y0 * scale:.2f}mm"></div>', h_mm)


def chapter_block(ch):
    return ('<div class="chap">'
            f'<span class="chap-label">{E(ch["label"])}</span>'
            f'<span class="chap-name">{E(ch["name"])}</span></div>')


def title_block(t):
    return f'<div class="ptitle"><span class="tick"></span>{E(t)}</div>'


def paras(ps, first_noindent=False):
    out = []
    for i, p in enumerate(ps):
        cls = 'body noindent' if (first_noindent and i == 0) else 'body'
        out.append(f'<p class="{cls}">{E(p)}</p>')
    return ''.join(out)


def running_head(side, chap_name):
    if side == 'l':
        return f'<div class="rh" style="left:{OUTER}mm">幸好，故事还在继续</div>'
    return f'<div class="rh" style="right:{OUTER}mm;text-align:right">{E(chap_name)}</div>'


def ornament(kind, side):
    """章末页底部外侧的小装饰（单色化枝叶 / 飞鸟），只放在余白充足的页面。"""
    if kind == 'maple':
        flip = 'transform:scaleX(-1);' if side == 'l' else ''
        pos = 'left:-3mm' if side == 'l' else 'right:-3mm'
        return (f'<img src="{DECO_DIR}/maple_tone.png" alt="" style="position:absolute;{pos};top:131mm;'
                f'width:30mm;height:45mm;{flip}opacity:{ORN}">')
    if kind == 'birds':
        x = OUTER + 4 if side == 'l' else W - OUTER - 30
        return (f'<svg aria-hidden="true" style="position:absolute;left:{x}mm;top:146mm" width="26mm" height="9.5mm" '
                'viewBox="0 0 120 44" fill="none" stroke="#5D7385" stroke-linecap="round" stroke-width="1">'
                '<path d="M8 22 Q13 16 18 21 Q23 15 29 19"/><path d="M52 10 Q56 6 60 9.5 Q64 5.5 68.5 8"/>'
                '<path d="M84 30 Q87 27.5 90 29.5 Q93 27 96 28.5"/></svg>')
    return ''


# ---------------------------------------------------------------- 页型
def p_titlepage(pg, side, sizes):
    t, sub, dates, ded = pg['paragraphs']
    return (f'<img class="sea" src="{DECO_DIR}/horizon_morning.jpg" alt="" '
            'style="left:0;bottom:0;width:250mm;height:46mm;object-fit:cover;object-position:62% 100%">'
            '<div style="position:absolute;top:22mm;right:30mm;display:flex;flex-direction:row-reverse;gap:6mm;align-items:flex-start">'
            f'<div class="v" style="font-size:20pt;font-weight:500;letter-spacing:.32em;line-height:1">{E(t)}</div>'
            f'<div class="v" style="font-size:9.5pt;letter-spacing:.42em;color:{GOLD_DEEP};padding-top:14mm">{E(sub)}</div></div>'
            '<div style="position:absolute;left:0;width:125mm;top:112mm;display:flex;flex-direction:column;align-items:center;gap:2.6mm">'
            f'<div style="font-family:\'Cormorant Garamond\',serif;font-size:11pt;letter-spacing:.18em;color:{GOLD_DEEP}">{E(dates)}</div>'
            f'<div style="font-size:9pt;letter-spacing:.14em;color:{MUTE}">{E(ded)}</div></div>')


def p_dedication(pg, side, sizes):
    x = tb_left(side)
    pl = PLACEMENTS.get(pg['page'])
    img_html = ''
    if pl:
        h, hmm = cropped(pl['img'], pl['crop'], pl['w'], sizes[pl['img']])
        img_html = (f'<div class="plate" style="left:{x + (TB_W - pl["w"]) / 2:.2f}mm;top:16mm">{h}</div>'
                    f'<div class="cap" style="left:{x}mm;width:{TB_W}mm;top:{16 + hmm + 4.2:.1f}mm;justify-content:center">'
                    f'<span class="cap-tx">{E(pl["cap"])}</span></div>')
    lines = ''.join(f'<p class="ded">{E(p)}</p>' for p in pg['paragraphs'])
    return (img_html + f'<div class="tb" style="left:{x}mm;top:98mm">'
            f'<div class="ptitle center"><span class="tick"></span>{E(pg["title"])}</div>{lines}</div>' + folio(pg['page']))


def p_toc(pg, side, sizes, toc_pages):
    x = tb_left(side)
    rows = []
    for p in pg['paragraphs']:
        label, _, name = p.partition('　')
        if not name:
            label, _, name = p.partition(' ')
        num = toc_pages.get(label, '')
        rows.append(f'<div class="toc-row"><span class="toc-l">{E(label)}</span><span class="toc-n">{E(name)}</span>'
                    f'<span class="toc-dots"></span><span class="toc-p">{num}</span></div>')
    return (f'<div class="tb" style="left:{x}mm;top:30mm">'
            f'<div class="ptitle" style="margin-bottom:9mm"><span class="tick"></span>{E(pg["title"])}</div>{"".join(rows)}</div>'
            + folio(pg['page']))


def p_text(pg, side, sizes, chap_name):
    x = tb_left(side)
    has_ch = bool(pg['chapter'])
    head = chapter_block(pg['chapter']) if has_ch else ''
    pl = PLACEMENTS.get(pg['page'])
    img_html = ''
    if pl:
        h, hmm = cropped(pl['img'], pl['crop'], pl['w'], sizes[pl['img']])
        cap = (f'<div class="cap-in"><span class="cap-tx">{E(pl["cap"])}</span></div>' if pl['cap'] else '')
        img_html = f'<div class="fig" style="width:{pl["w"]}mm">{h}{cap}</div>'
    body = paras(pg['paragraphs'])
    if pg['page'] in END_MARKS:
        body += f'<div class="endmark">{diamond(1.3)}</div>'
    rh = ('' if has_ch else running_head(side, chap_name)) + ornament(ORNAMENTS.get(pg['page']), side)
    return (rh + f'<div class="tb flow" style="left:{x}mm;top:{TOP}mm;height:{BOTTOM - TOP}mm" data-page="{pg["page"]}">'
            f'{head}{title_block(pg["title"])}{body}{img_html}</div>' + folio(pg['page']))


def p_illus(pg, side, sizes, caption):
    """P06 左 / P07 右：同一幅跨页插画横跨两页上部，下方各排本页原文。"""
    band = 64.0
    left = 0 if side == 'l' else -W
    nat_w, nat_h = sizes['illus']
    img_w = 2 * W
    img_h = nat_h * img_w / nat_w
    top_off = -0.35 * (img_h - band)
    out = [f'<div class="band" style="left:{left}mm;width:{2 * W}mm;height:{band}mm">'
           f'<img src="{IMG_DIR}/{IMG["illus"]}" alt="跨页插画" '
           f'style="width:{img_w}mm;height:{img_h:.2f}mm;top:{top_off:.2f}mm"></div>']
    if side == 'r' and caption:
        cap_lines = ''.join(f'<div>{E(l)}</div>' for l in caption['lines'])
        out.append('<div class="illus-cap" style="left:14mm;top:6mm">'
                   f'<div class="illus-cap-t">{E(caption["title"].strip("《》"))}</div>{cap_lines}</div>')
    x = tb_left(side)
    out.append(f'<div class="tb flow" style="left:{x}mm;top:{band + 6}mm;height:{BOTTOM - band - 6}mm" data-page="{pg["page"]}">'
               f'{title_block(pg["title"])}{paras(pg["paragraphs"])}</div>')
    out.append(folio(pg['page']))
    return ''.join(out)


def p_letter(pg, side, sizes):
    ps = pg['paragraphs']
    body = (f'<p class="letter salute">{E(ps[0])}</p>' +
            ''.join(f'<p class="letter">{E(p)}</p>' for p in ps[1:]))
    return ('<div class="sheet">'
            f'<div class="tb flow" style="left:{tb_left(side) - 5.5:.1f}mm;top:7mm;width:{TB_W}mm;height:146mm" data-page="{pg["page"]}">'
            f'{chapter_block(pg["chapter"]) if pg["chapter"] else ""}{title_block(pg["title"])}{body}</div></div>'
            + folio(pg['page']))


def p_afterword(pg, side, sizes):
    """P39 特别后记：已确认的 ChatGPT 署名版本。原文未提供时只排标题与占位，不代写。"""
    x = tb_left(side)
    ps = P39CFG.get('paragraphs')
    if ps:
        body = ''.join(f'<p class="body{" noindent" if i == 0 else ""}" style="margin-bottom:1.4mm">{E(p)}</p>'
                       for i, p in enumerate(ps))
    else:
        body = ('<div class="pending">〔已确认的特别后记原文待放入〕<br>'
                '<span>本页按原后记排版，不使用新拟稿；收到原文后替换此处。</span></div>')
    return (f'<div class="win" style="left:{x + TB_W - 28}mm;top:16mm;width:28mm;height:28mm">'
            f'<img src="{DECO_DIR}/window_twilight.jpg" alt="" style="width:23.5mm;height:23.5mm"></div>'
            f'<div class="tb flow" style="left:{x}mm;top:22mm;height:{BOTTOM - 22}mm" data-page="{pg["page"]}">'
            f'<div style="font-size:8.5pt;letter-spacing:.5em;color:{GOLD_DEEP};margin-bottom:2.5mm">{E(P39CFG.get("label", "后记"))}</div>'
            f'<div style="font-size:16pt;font-weight:500;letter-spacing:.14em;margin-bottom:14mm">{E(P39CFG.get("title", ""))}</div>{body}'
            '<div style="display:flex;justify-content:flex-end;align-items:center;gap:3mm;margin-top:6mm">'
            f'<span style="width:6.4mm;height:.26mm;background:{GOLD};display:inline-block"></span>'
            f'<span style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:13pt">{E(P39CFG.get("signature", ""))}</span></div></div>'
            + folio(pg['page']))


def p_night(pg, side, sizes):
    """P40：原稿文字 + 星空 + 二维码占位（链接确认前不可扫描）。"""
    x = tb_left(side)
    parts, after_qr = [], False
    for p in OVERRIDES.get(pg['page'], pg['paragraphs']):
        if p.startswith('[') and '二维码' in p:
            parts.append('<div class="qr"><div class="qr-in"><div>二维码位置</div><div>链接确认后生成</div></div></div>')
            after_qr = True
        elif p.isascii():
            parts.append(f'<p class="night en">{E(p)}</p>')
        else:
            parts.append(f'<p class="night{" close" if after_qr else ""}">{E(p)}</p>')
    stars = ('<svg aria-hidden="true" style="position:absolute;right:8mm;top:2.5mm" width="30mm" height="10mm" viewBox="0 0 128 43">'
             '<g fill="#E3D2A6"><circle cx="8" cy="30" r="0.9" opacity=".7"/><circle cx="40" cy="10" r="0.7" opacity=".8"/>'
             '<circle cx="74" cy="34" r="0.6" opacity=".6"/><circle cx="60" cy="18" r="0.8" opacity=".7"/>'
             '<path d="M26 16 L27 20 L31 21 L27 22 L26 26 L25 22 L21 21 L25 20 Z" opacity=".8"/></g>'
             f'<circle cx="108" cy="22" r="10" fill="#E3D2A6"/><circle cx="113" cy="18" r="9.2" fill="{NAVY}"/></svg>')
    return (f'<div class="bleed" style="background:{NAVY}"></div>' + stars +
            f'<img class="nightimg" src="{DECO_DIR}/night_whale.jpg" alt="">'
            + (f'<div class="night-ch" style="left:{x}mm">{E(pg["chapter"]["label"])}　{E(pg["chapter"]["name"])}</div>' if pg['chapter'] else '') +
            f'<div class="tb nightflow" style="left:{x}mm;top:15mm" data-page="{pg["page"]}">'
            f'<div class="ptitle night-t"><span class="tick"></span>{E(pg["title"])}</div>{"".join(parts)}</div>'
            + folio(pg['page'], GOLD_LIGHT))


CSS = """
@page { size: %PAGE%; margin: 0 }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #E9EEF1 }
body { font-family: 'Noto Serif SC', serif; color: %INK% }
.page { position: relative; overflow: hidden; break-after: page; flex: none; width: 125mm; height: 176mm; background: %PAPER% }
body.single .page { width: 125.2mm; height: 176.2mm }   /* 略大 0.2mm，避免像素取整在右缘/底边留缝；PDF 再精确裁回 125×176mm */
.spread, .spread .page, .blank { height: 176.2mm }
.spread { position: relative; display: flex; width: 250mm; height: 176mm; break-after: page; overflow: hidden }
.spread .page { break-after: auto }
.blank { width: 125mm; height: 176mm; background: #E9EEF1; flex: none }
.spine { position: absolute; top: 0; left: 117mm; width: 16mm; height: 176mm; pointer-events: none;
  background: linear-gradient(to right, rgba(60,45,25,0) 0%, rgba(60,45,25,.07) 50%, rgba(60,45,25,0) 100%) }
.v { writing-mode: vertical-rl }
.bleed { position: absolute; left: 0; top: 0; width: 125mm; height: 176mm }
.folio { position: absolute; left: 0; width: 125mm; top: 164.5mm; text-align: center;
  font-family: 'Cormorant Garamond', serif; font-size: 10pt; letter-spacing: .1em; font-variant-numeric: lining-nums }
.rh { position: absolute; top: 8.2mm; font-size: 7.5pt; letter-spacing: .3em; color: %RH% }
.tb { position: absolute; width: %TBW%mm }
.flow { overflow: hidden }
p.body { margin: 0; font-size: %SIZE%pt; line-height: %LEAD%pt; text-align: justify; text-indent: 2em; text-wrap: pretty }
.endmark { display: flex; justify-content: center; padding-top: 4.5mm }
p.body.noindent { text-indent: 0 }
.ptitle { font-size: 12.5pt; font-weight: 500; letter-spacing: .08em; line-height: 1.4; margin: 0 0 4.4mm; display: flex; align-items: center; gap: 2.6mm }
.ptitle.center { justify-content: center }
.tick { display: inline-block; width: 5mm; height: .26mm; background: %GOLD%; flex: none }
.chap { display: flex; align-items: baseline; gap: 3.2mm; margin: 0 0 4.2mm; padding-bottom: 2.2mm; border-bottom: .26mm solid %GOLD% }
.chap-label { font-size: 8.5pt; letter-spacing: .4em; color: %GOLDD%; flex: none }
.chap-name { font-size: 14pt; font-weight: 500; letter-spacing: .08em; line-height: 1.3 }
.dia { display: inline-block; background: %GOLD%; transform: rotate(45deg); margin: 1.2mm 0 0 .6mm }
.fig { margin: 4.5mm auto 0; display: flex; flex-direction: column; align-items: center; gap: 1.8mm }
.crop { position: relative; overflow: hidden; border: 1.1mm solid #FFFDF8;
  box-shadow: 0 .3mm .6mm rgba(34,49,63,.10), 0 2.6mm 5.6mm -2.4mm rgba(34,49,63,.24) }
.crop img { position: absolute; display: block; max-width: none }
.plate { position: absolute }
.cap, .cap-in { display: flex; gap: 1.2mm; align-items: baseline }
.cap { position: absolute }
.cap-tx { font-size: 8pt; letter-spacing: .08em; color: %MUTE% }
p.ded { margin: 0; text-align: center; font-size: %SIZE%pt; line-height: 1.95 }
.toc-row { display: flex; align-items: baseline; gap: 2.4mm; font-size: %SIZE%pt; line-height: 2.25 }
.toc-l { color: %GOLDD%; font-size: 8.5pt; letter-spacing: .2em; width: 13mm; flex: none }
.toc-n { flex: none }
.toc-dots { flex: 1; border-bottom: .2mm dotted #C9BFA9; transform: translateY(-1mm) }
.toc-p { font-family: 'Cormorant Garamond', serif; font-size: 10.5pt; font-variant-numeric: lining-nums; color: %GOLDD%; width: 6mm; text-align: right }
.band { position: absolute; top: 0; overflow: hidden }
.band img { position: absolute; left: 0; display: block; max-width: none }
.illus-cap { position: absolute; max-width: 50mm; color: #F4ECDD; font-size: 7.6pt; line-height: 1.75; letter-spacing: .06em; text-shadow: 0 0 2mm rgba(0,0,0,.55) }
.illus-cap-t { font-size: 8.4pt; letter-spacing: .24em; color: %GOLDL%; margin-bottom: 1mm }
.sheet { position: absolute; left: 5.5mm; top: 6mm; width: 114mm; height: 156mm; background: #FDFBF6;
  border: .26mm solid #E6DCCB; box-shadow: 0 .3mm .6mm rgba(34,49,63,.06), 0 3.2mm 6.4mm -3.7mm rgba(34,49,63,.18) }
p.letter { margin: 0; font-size: %SIZE%pt; line-height: %LEAD%pt; text-align: justify; text-indent: 2em }
p.letter.salute { text-indent: 0; margin-bottom: .6mm }
.win { position: absolute; border: .26mm solid %GOLDL%; border-radius: 50%; display: flex; justify-content: center; align-items: center }
.win img { border-radius: 50%; object-fit: cover; display: block }
.sea { position: absolute; -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 22mm); mask-image: linear-gradient(to bottom, transparent 0, #000 22mm) }
.nightimg { position: absolute; left: 0; bottom: 0; width: 125mm; height: 30mm; object-fit: cover; object-position: 50% 38%;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14mm); mask-image: linear-gradient(to bottom, transparent 0, #000 14mm) }
.nightflow { color: #EDE5D6 }
.night-t { color: #F4ECDD }
.night-t .tick { background: %GOLDL% }
p.night { margin: 0; font-size: %SIZE%pt; line-height: %LEAD%pt; text-align: justify; text-indent: 2em }
p.night.close { text-indent: 0; text-align: center; color: #F4ECDD; letter-spacing: .12em }
p.night.en { text-indent: 0; text-align: center; font-family: 'Cormorant Garamond', serif; letter-spacing: .32em; font-size: 9pt; color: %GOLDL%; margin-top: 2mm }
.qr { width: 36mm; height: 36mm; margin: 6.5mm auto 5.5mm; border: .26mm solid %GOLDL%; display: flex; justify-content: center; align-items: center }
.night-ch { position: absolute; top: 8.2mm; font-size: 7.5pt; letter-spacing: .3em; color: %GOLDL% }
.pending { font-size: 9.5pt; line-height: 1.9; color: %MUTE%; border: .26mm dashed #CFC4AE; padding: 6mm 5mm; text-align: center }
.pending span { font-size: 8pt }
.qr-in { width: 32mm; height: 32mm; background: %PAPER%; color: #3F4C58; font-size: 7.5pt; display: flex; flex-direction: column;
  justify-content: center; align-items: center; gap: 1mm; letter-spacing: .06em }
"""


def fonts_css():
    faces = [('Noto Serif SC', 'normal', 400, 'NotoSerifSC-Regular.woff'),
             ('Noto Serif SC', 'normal', 500, 'NotoSerifSC-Medium.woff'),
             ('Cormorant Garamond', 'normal', 400, 'CormorantGaramond-Regular.woff'),
             ('Cormorant Garamond', 'italic', 400, 'CormorantGaramond-Italic.woff')]
    return '<style>' + ''.join(
        f"@font-face{{font-family:'{f}';font-style:{s};font-weight:{w};src:url({FONT_DIR}/{fn}) format('woff')}}"
        for f, s, w, fn in faces) + '</style>'


def css(page_size):
    rep = {'%PAGE%': page_size, '%INK%': INK, '%PAPER%': PAPER, '%RH%': RH, '%TBW%': f'{TB_W}',
           '%SIZE%': f'{SIZE}', '%LEAD%': f'{LEAD}', '%GOLD%': GOLD, '%GOLDD%': GOLD_DEEP,
           '%GOLDL%': GOLD_LIGHT, '%MUTE%': MUTE}
    s = CSS
    for k, v in rep.items():
        s = s.replace(k, v)
    return s


def main():
    global SIZE, LEAD, IMG_DIR
    ap = argparse.ArgumentParser()
    ap.add_argument('pages')
    ap.add_argument('out')
    ap.add_argument('--size', type=float, default=SIZE)
    ap.add_argument('--lead', type=float, default=LEAD)
    ap.add_argument('--config', required=True, help='私有排版配置 JSON')
    ap.add_argument('--img-dir', default=IMG_DIR, help='照片目录（相对输出 HTML）')
    ap.add_argument('--only', default='', help='只输出这些对页，如 2-3,6-7')
    a = ap.parse_args()
    SIZE, LEAD, IMG_DIR = a.size, a.lead, a.img_dir
    doc = json.load(open(a.pages, encoding='utf-8'))
    cfg = json.load(open(a.config, encoding='utf-8'))
    IMG.update(cfg['images'])
    PLACEMENTS.update({int(k): v for k, v in cfg['placements'].items()})
    ORNAMENTS.update({int(k): v for k, v in cfg.get('ornaments', {}).items()})
    END_MARKS.update(cfg.get('end_marks', []))
    cdir = Path(a.config).parent

    def read_paras(rel):
        f = cdir / rel
        return [l.strip() for l in f.read_text(encoding='utf-8-sig').splitlines() if l.strip()] if f.exists() else None
    p39 = cfg.get('p39', {})
    P39CFG.update({k: v for k, v in p39.items() if k != 'file'})
    P39CFG['paragraphs'] = read_paras(p39['file']) if p39.get('file') else None
    for k, rel in cfg.get('page_overrides', {}).items():
        OVERRIDES[int(k)] = read_paras(rel)
    from PIL import Image
    Path(a.out).mkdir(parents=True, exist_ok=True)   # 先建输出目录，相对路径才能解析
    base = Path(a.out) / IMG_DIR
    sizes = {k: Image.open(base / v).size for k, v in IMG.items()}
    pages = {p['page']: p for p in doc['pages']}
    assert sorted(pages) == list(range(1, 41))

    # 章名：用于右页页眉与目录页码（P39 改排后记后，"尾声"从 P40 开始）
    chap_of, cur, toc = {}, '', {}
    for n in range(1, 41):
        ch = pages[n]['chapter']
        if ch:
            if n == 39 and ch['label'] == '尾声':
                pages[40]['chapter'] = ch          # 尾声标题随原稿内容移到 P40
                pages[39]['chapter'] = None
                ch = None
            else:
                cur = f"{ch['label']}　{ch['name']}"
                toc[ch['label']] = f'{n:02d}'
        chap_of[n] = cur
    if pages[40]['chapter']:
        toc['尾声'] = '40'

    def render(n):
        pg, side = pages[n], side_of(n)
        if n == 1:
            inner = p_titlepage(pg, side, sizes)
        elif n == 2:
            inner = p_dedication(pg, side, sizes)
        elif n == 3:
            inner = p_toc(pg, side, sizes, toc)
        elif n in (6, 7):
            inner = p_illus(pg, side, sizes, doc['illustration_caption'])
        elif n == 38:
            inner = p_letter(pg, side, sizes)
        elif n == 39:
            inner = p_afterword(pg, side, sizes)
        elif n == 40:
            inner = p_night(pg, side, sizes)
        else:
            inner = p_text(pg, side, sizes, chap_of[n])
        bg = NAVY if n == 40 else PAPER
        return f'<section class="page {side}" data-page="{n}" style="background:{bg}">{inner}</section>'

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    head = f'<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">{fonts_css()}'
    single = ''.join(render(n) for n in range(1, 41))
    (out / 'book_single.html').write_text(f'{head}<title>幸好，故事还在继续 · 单页</title><style>{css("125mm 176mm")}</style></head><body class="single">{single}</body></html>', encoding='utf-8')
    pairs = [(None, 1)] + [(i, i + 1) for i in range(2, 39, 2)] + [(40, None)]
    if a.only:
        want = {tuple(int(x) for x in s.split('-')) for s in a.only.split(',')}
        pairs = [p for p in pairs if (p[0] or 0, p[1] or 0) in want]
    spreads = []
    for l, r in pairs:
        lh = render(l) if l else '<div class="blank"></div>'
        rh = render(r) if r else '<div class="blank"></div>'
        spreads.append(f'<section class="spread">{lh}{rh}{"<div class=spine></div>" if l and r else ""}</section>')
    (out / 'book_spread.html').write_text(f'{head}<title>幸好，故事还在继续 · 对页</title><style>{css("250mm 176mm")}</style></head><body>{"".join(spreads)}</body></html>', encoding='utf-8')
    print('built', out, 'size', SIZE, 'lead', LEAD, 'spreads', len(spreads))


if __name__ == '__main__':
    main()
