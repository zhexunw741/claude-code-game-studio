#!/usr/bin/env bash
# 一键重建：HTML → PDF（单页 / 对页 / 3mm 出血参考版）→ 校正页面框 → 逐页预览与总览
# 用法: 在本目录运行  bash 生成全部.sh
# 依赖: python3（Pillow、numpy、pypdf），node + playwright（chromium）
# 输出到 ../输出；图片引用 ../素材/处理后，字体引用 ../字体
set -euo pipefail
cd "$(dirname "$0")"
OUT="../输出"
mkdir -p "$OUT"

# 素材只在原图变化时需要重做：python3 prep_assets.py ../素材/原图 ../素材/处理后
python3 build.py "$OUT"
python3 build.py "$OUT" --bleed 3
node render.js "$OUT"
python3 fix_boxes.py "$OUT/幸好_纪念册_v7_40页.pdf" 125 176
python3 fix_boxes.py "$OUT/幸好_纪念册_v7_对页.pdf" 250 176
python3 fix_boxes.py "$OUT/幸好_纪念册_v7_40页_出血3mm.pdf" 131 182 3
python3 contact.py "$OUT/preview" "$OUT/40页总览.jpg"
echo "完成：$OUT"
