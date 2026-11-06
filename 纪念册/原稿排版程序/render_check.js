// 渲染并检查：每页文字是否溢出、截图逐页与对页。用法: node render_check.js <输出目录> [pdf]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const out = path.resolve(process.argv[2]);
const wantPdf = process.argv[3] === 'pdf';

async function load(page, f) {
  await page.goto('file://' + path.join(out, f), { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
  });
  await page.waitForTimeout(600);
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  fs.mkdirSync(path.join(out, 'preview'), { recursive: true });

  await load(page, 'book_single.html');
  const report = await page.evaluate(() => {
    const mm = 96 / 25.4;
    return [...document.querySelectorAll('section.page')].map((s) => {
      const n = +s.dataset.page;
      const flows = [...s.querySelectorAll('.flow, .nightflow')];
      const pageBox = s.getBoundingClientRect();
      let over = 0, spare = null;
      for (const f of flows) {
        const r = f.getBoundingClientRect();
        // 实际内容底部
        let bottom = r.top;
        for (const c of f.children) bottom = Math.max(bottom, c.getBoundingClientRect().bottom);
        if (f.classList.contains('flow')) {
          over = Math.max(over, (f.scrollHeight - f.clientHeight) / mm);
          spare = (r.bottom - bottom) / mm;
        } else {
          spare = (pageBox.top + 158 * mm - bottom) / mm;
          if (spare < 0) over = -spare;
        }
      }
      const imgs = [...s.querySelectorAll('img')].filter((i) => !i.complete || i.naturalWidth === 0).length;
      return { n, over: +over.toFixed(1), spare: spare === null ? null : +spare.toFixed(1), brokenImgs: imgs };
    });
  });
  for (const r of report) console.log(`P${String(r.n).padStart(2, '0')}\t溢出 ${r.over}mm\t余量 ${r.spare}mm\t坏图 ${r.brokenImgs}`);
  const els = await page.$$('section.page');
  for (let i = 0; i < els.length; i++) await els[i].screenshot({ path: path.join(out, 'preview', `page-${String(i + 1).padStart(2, '0')}.png`) });
  if (wantPdf) await page.pdf({ path: path.join(out, 'single.pdf'), width: '125.2mm', height: '176.2mm', printBackground: true });

  await load(page, 'book_spread.html');
  const sp = await page.$$('section.spread');
  for (let i = 0; i < sp.length; i++) await sp[i].screenshot({ path: path.join(out, 'preview', `spread-${String(i + 1).padStart(2, '0')}.png`) });
  if (wantPdf) await page.pdf({ path: path.join(out, 'spread.pdf'), width: '250mm', height: '176.2mm', printBackground: true });
  console.log('spreads', sp.length);
  await b.close();
})();
