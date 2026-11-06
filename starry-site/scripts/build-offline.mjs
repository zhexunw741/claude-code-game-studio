// 把构建产物（dist/）合成一个完全独立的 HTML 文件，供手机直接打开（不需要服务器、网络或域名）。
//
// - CSS、JavaScript、两个字体子集和图标全部内联；字体与图标转成 data: 地址。
// - 原来的 ES 模块脚本改成放在 <body> 末尾的普通脚本（外层包一层函数），本地文件也能运行。
// - 加上内容安全策略（CSP）：只允许内联脚本、内联样式和 data: 字体/图片，
//   浏览器会拒绝任何对外请求——"不联网"由浏览器强制执行，而不只是没写网址。
// - 写出后再扫一遍：只要还有外部引用就报错退出。
//
// 用法：OFFLINE=1 vite build --outDir <dist> 之后
//   DIST=<dist> OUT_FILE=<输出.html> node scripts/build-offline.mjs
// 文案来自构建时的 STORY_CONTENT；本脚本不含任何文案。

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

const DIST = resolve(process.env.DIST || 'dist');
const OUT_FILE = process.env.OUT_FILE;
if (!OUT_FILE) {
  console.error('请用 OUT_FILE 指定输出文件，例如 OUT_FILE=~/private/星空.html');
  process.exit(2);
}

const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const dataUri = (file) => {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`不知道如何内联：${file}`);
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};
const local = (base, ref) => {
  const f = resolve(base, ref.split(/[?#]/)[0]);
  if (!f.startsWith(DIST)) throw new Error(`引用越出构建目录：${ref}`);
  if (!existsSync(f)) throw new Error(`找不到被引用的文件：${ref}`);
  return f;
};
// CSS 里的 url(...)：相对路径一律换成 data: 地址
const inlineCssUrls = (css, base) =>
  css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => (/^(data:|#)/.test(ref) ? m : `url(${dataUri(local(base, ref))})`));
const noCloseTag = (code, tag) => code.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`);

let html = readFileSync(join(DIST, 'index.html'), 'utf8');
let script = '';

// 1. 外链样式表 → 内联 <style>
html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
  const href = /href="([^"]+)"/.exec(tag)[1];
  const file = local(DIST, href);
  return `<style>${noCloseTag(inlineCssUrls(readFileSync(file, 'utf8'), dirname(file)), 'style')}</style>`;
});

// 2. 模块脚本 → 移到 body 末尾的普通脚本
html = html.replace(/<script\b[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>\s*/g, (tag, src) => {
  const js = readFileSync(local(DIST, src), 'utf8');
  if (/^\s*(import|export)\s/m.test(js) || /import\.meta|\bimport\(/.test(js)) throw new Error('脚本含模块语法，不能改成普通脚本');
  script += `<script>(function(){"use strict";\n${noCloseTag(js, 'script')}\n})();</script>`;
  return '';
});
html = html.replace('</body>', `${script}\n</body>`);

// 3. 字体预加载不再需要；内联 <style> 里的字体地址换成 data:
html = html.replace(/<link\b[^>]*rel="preload"[^>]*>/g, '');
html = html.replace(/<style>([\s\S]*?)<\/style>/g, (m, css) => `<style>${inlineCssUrls(css, DIST)}</style>`);

// 4. 图标
html = html.replace(/(<link\b[^>]*rel="icon"[^>]*href=")([^"]+)(")/g, (m, a, href, b) => (href.startsWith('data:') ? m : a + dataUri(local(DIST, href)) + b));

// 5. 内容安全策略：只允许内联与 data:，其余一律拒绝（包括任何联网请求）
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'";
html = html.replace(/<meta charset="utf-8"\s*\/?>/i, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
if (!html.includes('Content-Security-Policy')) throw new Error('没有找到 <meta charset>，无法插入 CSP');

// 6. 自检：不得再有任何外部引用
const problems = [];
for (const m of html.matchAll(/\s(?:src|href)="([^"]*)"/g)) if (!/^(data:|#)/.test(m[1])) problems.push(`属性引用 ${m[1]}`);
for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)/g)) if (!/^(data:|#)/.test(m[1])) problems.push(`CSS 引用 ${m[1]}`);
for (const m of html.matchAll(/@import/g)) problems.push(`@import at ${m.index}`);
for (const m of html.matchAll(/https?:\/\/[^\s"'<>)]+/g)) if (!m[0].startsWith('http://www.w3.org/')) problems.push(`网址 ${m[0]}`);
if (/type="module"/.test(html)) problems.push('仍有模块脚本');
if (problems.length) {
  console.error('离线文件仍有外部引用：\n  ' + problems.join('\n  '));
  process.exit(1);
}

writeFileSync(OUT_FILE, html);
const buf = Buffer.from(html);
console.log(`${OUT_FILE}\n  ${(buf.length / 1024).toFixed(1)} KB · SHA256 ${createHash('sha256').update(buf).digest('hex')}`);
