// 生成网页字体子集：只保留本站实际用到的字，思源宋体（Noto Serif SC，SIL OFL）从约 8MB 减到几十 KB。
// 源字体默认取仓库里纪念册使用的同一套字体；也可用 FONT_SRC_DIR 指定。
// 找不到源字体时跳过，网页会退回系统宋体，不影响使用。
import fs from 'node:fs';
import path from 'node:path';
import { loadStory, collectTexts, projectRoot } from './story-path.mjs';

const srcDir = process.env.FONT_SRC_DIR || path.resolve(projectRoot, '..', '纪念册', '字体');
const outDir = path.join(projectRoot, 'public', 'fonts', 'generated');
const faces = [
  ['NotoSerifSC-Regular.woff', 'serif-400.woff2'],
  ['NotoSerifSC-Medium.woff', 'serif-500.woff2'],
];

const { story } = loadStory();
const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8').replace(/<[^>]+>/g, ' ');
const base = ' 0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,:;!?·—–-_()[]/\'"“”‘’《》〈〉「」『』〔〕，。、：；！？…×%+=';
const chars = new Set([...base, ...html, ...collectTexts(story).map((x) => x.t).join('')]);
const text = [...chars].join('');

let subsetFont;
try {
  subsetFont = (await import('subset-font')).default;
} catch {
  console.warn('提示：未安装 subset-font，跳过字体子集（网页将使用系统宋体）');
  process.exit(0);
}
fs.mkdirSync(outDir, { recursive: true });
let made = 0;
for (const [src, out] of faces) {
  const p = path.join(srcDir, src);
  if (!fs.existsSync(p)) {
    console.warn(`提示：找不到源字体 ${p}，跳过（网页将使用系统宋体）`);
    continue;
  }
  const buf = await subsetFont(fs.readFileSync(p), text, { targetFormat: 'woff2' });
  fs.writeFileSync(path.join(outDir, out), buf);
  console.log(`字体子集 ${out}：${chars.size} 个字符，${(buf.length / 1024).toFixed(1)} KB`);
  made++;
}
if (!made) {
  for (const [, out] of faces) fs.rmSync(path.join(outDir, out), { force: true });
}
