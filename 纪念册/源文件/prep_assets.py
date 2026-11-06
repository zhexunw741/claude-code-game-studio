"""素材处理：由三张原创原图生成排版用的裁切、调色与单色枝叶。
用法: python3 prep_assets.py ../素材/原图 ../素材/处理后
原图不改动；输出 JPG/PNG 供 build.py 引用。
"""
import sys, numpy as np
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
A = src  # 原图目录：海天与鲸_原创封面.png / 水彩柳枝.png / 水彩枫枝.png

def hex2(c): return np.array([int(c[i:i+2],16) for i in (1,3,5)],float)/255

def tone_png(name, dark, light, outname, lo=110, hi=235, size=None):
    im = Image.open(f'{A}/{name}.png').convert('RGBA')
    if size: im = im.resize(size, Image.LANCZOS)
    a = np.array(im).astype(float)
    rgb, al = a[...,:3]/255, a[...,3]
    lum = rgb @ np.array([.299,.587,.114])
    # normalise lum over visible pixels
    m = al>200
    l0,l1 = np.percentile(lum[m],2), np.percentile(lum[m],98)
    t = np.clip((lum-l0)/(l1-l0),0,1)
    col = hex2(dark)[None,None,:]*(1-t[...,None]) + hex2(light)[None,None,:]*t[...,None]
    wf = np.clip((lum-0.86)/0.08,0,1)
    na = np.clip((al-lo)/(hi-lo),0,1)*(1-wf)*255
    res = np.dstack([col*255, na]).astype(np.uint8)
    Image.fromarray(res,'RGBA').save(f'{out}/{outname}', optimize=True)

tone_png('水彩柳枝', '#5F7B70', '#D3DDCF', 'willow_tone.png', size=(683,1024))
tone_png('水彩枫枝', '#A07A5C', '#EAD7BC', 'maple_tone.png', size=(683,1024))

cov = Image.open(f'{A}/海天与鲸_原创封面.png').convert('RGB')
cov.save(f'{out}/cover.jpg', quality=92)
W,H = cov.size
# horizon strip (morning)
hz = cov.crop((0, 1085, W, H))
hz.save(f'{out}/horizon_morning.jpg', quality=92)
# dusk grade
a = np.array(hz).astype(float)/255
h = a.shape[0]
y = np.linspace(0,1,h)[:,None,None]
top, mid, bot = hex2('#E9C7B9'), hex2('#F1D9C2'), hex2('#9FA6BE')
grad = np.where(y<0.45, top*(1-y/0.45)+mid*(y/0.45), mid*(1-(y-0.45)/0.55)+bot*((y-0.45)/0.55))
lum = (a @ np.array([.299,.587,.114]))[...,None]
dusk = np.clip(0.35*a + 0.65*(grad*(0.55+0.6*lum)),0,1)
Image.fromarray((dusk*255).astype(np.uint8)).save(f'{out}/horizon_dusk.jpg', quality=92)
# night grade of whale crop
nc = cov.crop((360, 700, W, H))
a = np.array(nc).astype(float)/255
lum = a @ np.array([.299,.587,.114])
l0,l1 = np.percentile(lum,1), np.percentile(lum,99.5)
t = np.clip((lum-l0)/(l1-l0),0,1)**2.0
d, m2, l = hex2('#0A1524'), hex2('#18293F'), hex2('#7E93AA')
col = np.where(t[...,None]<0.6, d*(1-t[...,None]/0.6)+m2*(t[...,None]/0.6), m2*(1-(t[...,None]-0.6)/0.4)+l*((t[...,None]-0.6)/0.4))
# gold glints on highest highlights
g = np.clip((t-0.93)/0.07,0,1)[...,None]
col = col*(1-g*0.6) + hex2('#E3D2A6')*g*0.6
Image.fromarray((col*255).astype(np.uint8)).save(f'{out}/night_whale.jpg', quality=92)
print('ok')

# ---- v7 full book: square "window" crops (birds + clouds + sea, whale excluded), graded by time of day
def grade(arr, top, mid, bot, keep):
    h = arr.shape[0]
    y = np.linspace(0,1,h)[:,None,None]
    t_, m_, b_ = hex2(top), hex2(mid), hex2(bot)
    g = np.where(y<0.45, t_*(1-y/0.45)+m_*(y/0.45), m_*(1-(y-0.45)/0.55)+b_*((y-0.45)/0.55))
    lum = (arr @ np.array([.299,.587,.114]))[...,None]
    return np.clip(keep*arr + (1-keep)*(g*(0.38+0.78*lum)),0,1)

win = cov.crop((0, 820, 522, 1342))
win.save(f'{out}/window_morning.jpg', quality=92)
wa = np.array(win).astype(float)/255
for name, args in {
    'golden':   ('#E8B877', '#F2D29C', '#6E8F8C', 0.34),
    'dusk':     ('#DFA699', '#EDC6AE', '#7C86A6', 0.32),
    'twilight': ('#9A89B6', '#C8ADBD', '#44537A', 0.28),
}.items():
    Image.fromarray((grade(wa,*args)*255).astype(np.uint8)).save(f'{out}/window_{name}.jpg', quality=92)
print('windows ok')
