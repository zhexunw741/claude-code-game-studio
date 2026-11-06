#!/usr/bin/env python3
"""把 Chromium 输出的 PDF 页面框校正为精确毫米尺寸。

Chromium 以 0.01 英寸为单位取整纸张尺寸（125mm 会变成 125.22mm），
本脚本保持左上角对齐，裁掉右侧与底部多出的不到 0.3mm，
并写入 TrimBox（裁切框）与 BleedBox（出血框）。

用法: python3 fix_boxes.py <pdf> <宽mm> <高mm> [出血mm]
"""
import sys
from pypdf import PdfReader, PdfWriter
from pypdf.generic import RectangleObject

MM = 72 / 25.4


def main():
    path, w_mm, h_mm = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    bleed = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
    W, H, B = w_mm * MM, h_mm * MM, bleed * MM
    reader = PdfReader(path)
    writer = PdfWriter()
    for page in reader.pages:
        top = float(page.mediabox.top)
        box = RectangleObject([0, top - H, W, top])
        page.mediabox = box
        page.cropbox = box
        page.bleedbox = box
        page.trimbox = RectangleObject([B, top - H + B, W - B, top - B])
        writer.add_page(page)
    writer.add_metadata(reader.metadata or {})
    with open(path, 'wb') as f:
        writer.write(f)
    print(f'{path}: {len(reader.pages)} 页 → {w_mm}×{h_mm}mm, 裁切框内缩 {bleed}mm')


if __name__ == '__main__':
    main()
