// 渲染 PDF 与逐页预览。用法: node render.js <输出目录>
// 需要 playwright (chromium)。字体经 Google Fonts 在线加载，并以子集嵌入 PDF。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2]);

async function load(page, file) {
  await page.goto('file://' + path.join(out, file), { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(800);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  fs.mkdirSync(path.join(out, 'preview'), { recursive: true });

  const jobs = [
    ['book_single.html', '幸好_纪念册_v7_40页.pdf', '.page', 'page'],
    ['book_spread.html', '幸好_纪念册_v7_对页.pdf', '.spread', 'spread'],
  ];
  for (const extra of fs.readdirSync(out).filter((f) => /^book_single_bleed.*\.html$/.test(f))) {
    jobs.push([extra, extra.replace('book_single_bleed', '幸好_纪念册_v7_40页_出血').replace('.html', '.pdf'), null, null]);
  }

  for (const [html, pdf, sel, prefix] of jobs) {
    await load(page, html);
    // 以 CSS @page 的毫米尺寸输出；再用 pdf 尺寸参数兜底，避免 Chromium 把宽度取整到像素
    const size = await page.evaluate(() => {
      const el = document.querySelector('.spread, .page');
      return { w: el.style.width || '250mm', h: el.style.height || '176mm' };
    });
    await page.pdf({ path: path.join(out, pdf), width: size.w, height: size.h, printBackground: true });
    console.log('pdf', pdf);
    if (!sel) continue;
    const els = await page.$$(sel);
    let i = 0;
    for (const el of els) {
      i += 1;
      await el.screenshot({ path: path.join(out, 'preview', `${prefix}-${String(i).padStart(2, '0')}.png`) });
    }
    console.log(prefix, els.length);
  }
  const fams = await page.evaluate(() => {
    const s = new Set();
    document.fonts.forEach((f) => f.status === 'loaded' && s.add(f.family));
    return [...s];
  });
  console.log('fonts', fams.join(', '));
  await browser.close();
})();
