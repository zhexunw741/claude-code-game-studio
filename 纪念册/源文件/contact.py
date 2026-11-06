import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
src = Path(sys.argv[1]); out = sys.argv[2]
files = sorted(src.glob('spread-*.png'))
cols, cw = 3, 620
im0 = Image.open(files[0]); ch = int(cw * im0.height / im0.width)
pad, lab = 36, 34
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (pad + cols * (cw + pad), pad + rows * (ch + lab + pad)), (232, 237, 240))
d = ImageDraw.Draw(sheet)
font = ImageFont.truetype('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc', 20)
pairs = ['P01'] + [f'P{i:02d}–P{i+1:02d}' for i in range(2, 39, 2)] + ['P40']
for k, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((cw, ch), Image.LANCZOS)
    x = pad + (k % cols) * (cw + pad); y = pad + (k // cols) * (ch + lab + pad)
    sheet.paste(im, (x, y)); d.text((x, y + ch + 8), pairs[k], fill=(62, 74, 85), font=font)
sheet.save(out, quality=86)
print(out, sheet.size)
