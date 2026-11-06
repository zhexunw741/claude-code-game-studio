/* 离线单文件版测试：直接用 file:// 打开生成的 HTML（与手机"打开本地文件"相同），不经过任何服务器。
 * 环境变量：OFFLINE_HTML（离线 HTML 路径，必填）、STORY_CONTENT（构建时用的文案文件）、OUT（结果与截图目录）
 * 期望值全部从文案文件读取，脚本里不含故事文字。
 *
 * 覆盖：
 *   - 安卓手机尺寸（Pixel 7、Galaxy S9+ 设备模拟）与 iPhone 尺寸（Chromium 模拟，不是真实 Safari）完整走一遍；
 *   - 断网状态下打开；全程不得有任何网络请求，不得触发内容安全策略拦截，不得有脚本错误；
 *   - 每张卡片、生日页、结尾的文字与文案文件逐字一致；安卓返回键能关闭卡片；
 *   - 关闭 JavaScript（相当于 iPhone"文件"/微信预览等不运行脚本的查看方式）时，静态版本可完整阅读和点开；
 *   - 浏览器禁止存储、系统"减少动画"时仍可正常使用。
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const HTML = process.env.OFFLINE_HTML && path.resolve(process.env.OFFLINE_HTML);
if (!HTML || !fs.existsSync(HTML)) {
  console.error('请用 OFFLINE_HTML 指定离线 HTML 文件');
  process.exit(2);
}
const URL0 = pathToFileURL(HTML).href;
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'test-output-offline'));
const storyPath = path.resolve(process.env.STORY_CONTENT || path.join(ROOT, 'content/story.sample.json'));
const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
const t = (v) => (typeof v === 'string' ? v : v.t);
const norm = (s) => s.replace(/\s+/g, '');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const results = [];
const record = (group, name, ok, detail = '') => {
  results.push({ group, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? ' — ' + detail : ''}`);
};
const FORBIDDEN = ((story.rules || {}).forbiddenDates || []).map((p) => new RegExp(p));
const LOCKED = (story.rules || {}).lockedDates || [];

/* 监听：网络请求（只允许本文件与 data:）、脚本错误、CSP 拦截 */
function watch(page) {
  const w = { requests: [], errors: [] };
  page.on('request', (r) => {
    const u = r.url();
    if (u.startsWith('data:') || u.split('#')[0] === URL0) return;
    w.requests.push(u);
  });
  page.on('pageerror', (e) => w.errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && w.errors.push(m.text()));
  return w;
}
const CSP_HOOK = () => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
};

async function textsOf(page, sel) {
  return page.locator(sel).evaluateAll((els) => els.map((e) => e.innerText.trim()));
}

/* ------------------------------------------------------------ 1. 文件本身 */
function fileSuite() {
  const g = '单个文件';
  const html = fs.readFileSync(HTML, 'utf8');
  const kb = fs.statSync(HTML).size / 1024;
  record(g, '是一个独立文件，大小合理', kb < 400, `${kb.toFixed(1)} KB`);
  record(g, '带内容安全策略：禁止一切外部请求', /http-equiv="Content-Security-Policy" content="default-src 'none';/.test(html));
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]).filter((r) => !/^(data:|#)/.test(r));
  const urls = [...html.matchAll(/url\(\s*['"]?([^'")]+)/g)].map((m) => m[1]).filter((r) => !r.startsWith('data:'));
  const nets = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org/'));
  record(g, '没有外部文件、网址或 CDN 引用', !refs.length && !urls.length && !nets.length, [...refs, ...urls, ...nets].slice(0, 3).join(' '));
  record(g, '字体已内嵌', (html.match(/data:font\/woff2;base64,/g) || []).length >= 2);
  record(g, '没有模块脚本（本地文件可直接运行）', !/type="module"/.test(html));
  record(g, '没有禁用日期写法', !FORBIDDEN.some((re) => re.test(html)), `规则 ${FORBIDDEN.length} 条`);
  for (const l of LOCKED) {
    const s = story.stars[l.star - 1];
    record(g, `第${l.star}颗星日期锁定为 ${l.date}`, s.date === l.date && html.includes(l.date));
  }
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const all = [];
  const add = (v) => v !== undefined && all.push(t(v));
  add(story.intro.title); add(story.intro.subtitle);
  story.stars.forEach((s) => { add(s.title); add(s.place); s.paras.forEach(add); });
  story.egg.paras.forEach(add);
  const b = story.birthday; add(b.heading); add(b.hero); b.paras.forEach(add); add(b.lightDone);
  const e = story.ending; add(e.title); add(e.sub); add(e.bookRef); add(e.footer);
  const plain = html.replace(/<[^>]+>/g, '');   // 开场标题按逗号拆成两行 <span>，去掉标签后再找
  const missing = all.filter((s) => !html.includes(s) && !html.includes(esc(s)) && !plain.includes(esc(s)));
  record(g, `全部 ${all.length} 段文案都在文件里`, missing.length === 0, missing.slice(0, 2).join(' | '));
}

/* ------------------------------------------------------------ 2. 交互版完整流程 */
async function phoneSuite(browser, label, deviceName, opts = {}) {
  const g = label;
  const ctx = await browser.newContext({ ...devices[deviceName], ...(opts.ctx || {}) });
  if (opts.offline) await ctx.setOffline(true);
  await ctx.addInitScript(CSP_HOOK);
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const w = watch(page);
  const vp = page.viewportSize();
  const shot = async (n) => opts.shots && page.screenshot({ path: path.join(OUT, 'shots', `${opts.shots}-${n}.png`) });

  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const title = await page.locator('#intro-title').innerText();
  record(g, '打开本地文件后首屏显示标题', norm(title) === norm(t(story.intro.title)), title.replace(/\n/g, ''));
  record(g, '交互版已运行（JavaScript 生效）', await page.evaluate(() => document.documentElement.classList.contains('js')));
  await shot('1-intro');

  await page.locator('#enter-btn').tap();
  await page.waitForSelector('#scene-sky:not([hidden])');
  const stars = page.locator('.star');
  record(g, '星空里有六颗回忆星星', (await stars.count()) === 6);
  await page.waitForTimeout(600);
  await shot('2-sky');

  let textOk = 0;
  for (let i = 0; i < 6; i++) {
    const s = story.stars[i];
    await stars.nth(i).tap();
    await page.waitForSelector('.card-layer:not([hidden]) .card');
    await page.waitForTimeout(450);
    const ct = await page.locator('#card-title').innerText();
    const meta = await page.locator('.card-meta').innerText();
    const ps = await textsOf(page, '.card-body p');
    const ok = ct === t(s.title) && meta.includes(s.date) && (!s.place || meta.includes(t(s.place))) &&
      JSON.stringify(ps) === JSON.stringify(s.paras.map(t));
    if (ok) textOk++;
    else record(g, `第${i + 1}颗星卡片文字`, false, `${ct} / ${meta} / ${ps.length} 段`);
    if (i === 0) await shot('3-card');
    if (i === 1 && opts.backButton) {
      await page.goBack();   // 安卓返回键 / 返回手势
      await page.waitForSelector('.card-layer', { state: 'hidden' });
      record(g, '安卓返回键关闭卡片并回到星空', await page.locator('#scene-sky:not([hidden])').count() === 1);
      continue;
    }
    await page.locator('.card-nav .btn-primary').tap();
    await page.waitForSelector('.card-layer', { state: 'hidden' });
  }
  record(g, '六张回忆卡片：标题、日期、地点、正文与文案逐字一致', textOk === 6, `${textOk}/6`);
  const prog = await page.locator('.sky-progress').innerText();
  record(g, '六颗星全部点亮', prog.includes('6/6'), prog);

  await page.locator('.egg').tap();
  await page.waitForSelector('.card-layer:not([hidden]) .card');
  const eggOk = (await page.locator('#card-title').innerText()) === t(story.egg.title) &&
    JSON.stringify(await textsOf(page, '.card-body p')) === JSON.stringify(story.egg.paras.map(t));
  record(g, '隐藏的小星星可以点开，文字一致', eggOk);
  await page.locator('.card-nav .btn-primary').tap();
  await page.waitForSelector('.card-layer', { state: 'hidden' });
  await page.waitForTimeout(1200);
  await shot('4-sky-all');

  await page.locator('.bday-ready').tap();
  await page.waitForSelector('#scene-birthday:not([hidden])');
  const b = story.birthday;
  const bOk = (await page.locator('#birthday-heading').innerText()) === t(b.heading) &&
    norm(await page.locator('.bday-hero').innerText()) === norm(t(b.hero)) &&
    JSON.stringify(await textsOf(page, '.bday-body p')) === JSON.stringify(b.paras.map(t)) &&
    (await page.locator('.bday-final').innerText()).trim() === t(b.lightDone);
  record(g, '生日祝福与文案逐字一致（主句未改动）', bOk);
  await page.locator('#light-btn').scrollIntoViewIfNeeded();
  await page.locator('#light-btn').tap();
  record(g, '"点亮给你的最后一颗星"生效', (await page.locator('#scene-birthday.is-lit').count()) === 1);
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('5-birthday');

  await page.locator('#scene-birthday .scene-nav .btn-primary').tap();
  await page.waitForSelector('#scene-end:not([hidden])');
  const e = story.ending;
  const eOk = (await page.locator('#end-heading').innerText()) === t(e.title) &&
    norm(await page.locator('.end-sub').innerText()) === norm(t(e.sub)) &&
    (await page.locator('.end-book').innerText()).trim() === t(e.bookRef) &&
    (await page.locator('.end-foot').innerText()).trim() === t(e.footer);
  record(g, '结尾文字一致', eOk);
  const frame = () => page.evaluate(() => document.getElementById('sky-canvas').toDataURL('image/png').length + ':' +
    document.getElementById('sky-canvas').toDataURL('image/png').slice(-200));
  const f1 = await frame();
  await page.waitForTimeout(900);
  const f2 = await frame();
  record(g, '结尾动画在播放（星空画面持续变化）', opts.reduced ? true : f1 !== f2, opts.reduced ? '减少动画模式下为静止画面' : '');
  await page.waitForTimeout(1600);
  await shot('6-end');
  const o = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  record(g, '无横向溢出', o, `${vp.width}×${vp.height}`);

  await page.locator('#scene-end .btn-ghost').tap();   // "再看一次"：回到开场并清空点亮记录
  await page.waitForSelector('#scene-intro:not([hidden])');
  await page.locator('#enter-btn').tap();
  await page.waitForSelector('#scene-sky:not([hidden])');
  record(g, '"再看一次"回到开场，星星重新从 0 颗开始', (await page.locator('.sky-progress').innerText()).includes('0/6'));

  const csp = await page.evaluate(() => window.__csp);
  record(g, '全程没有任何网络请求', w.requests.length === 0, w.requests.slice(0, 3).join(' '));
  record(g, '没有被内容安全策略拦截的内容', csp.length === 0, csp.slice(0, 3).join(' | '));
  record(g, '没有脚本错误', w.errors.length === 0, w.errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ 3. 不运行 JavaScript 的查看方式 */
async function staticSuite(browser, label, deviceName, shots) {
  const g = label;
  const ctx = await browser.newContext({ ...devices[deviceName], javaScriptEnabled: false });
  const page = await ctx.newPage();
  const w = watch(page);
  const shot = async (n) => shots && page.screenshot({ path: path.join(OUT, 'shots', `${shots}-${n}.png`) });
  await page.goto(URL0, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  record(g, '首屏标题可见', norm(await page.locator('#intro-title').innerText()) === norm(t(story.intro.title)));
  await shot('1-intro');

  await page.locator('#enter-btn').tap();
  await page.waitForTimeout(1200);
  record(g, '开场按钮跳到星空列表', (await page.evaluate(() => window.scrollY)) > 200);
  const sums = page.locator('.ns-stars .ns-star summary');
  record(g, '六颗星星都列出（标题与日期）', (await sums.count()) === 6 &&
    JSON.stringify(await textsOf(page, '.ns-stars .ns-title')) === JSON.stringify(story.stars.map((s) => t(s.title))) &&
    JSON.stringify(await textsOf(page, '.ns-stars .ns-date')) === JSON.stringify(story.stars.map((s) => s.date)));
  let ok = 0;
  for (let i = 0; i < 6; i++) {
    await sums.nth(i).tap();
    const body = page.locator('.ns-stars .ns-star').nth(i).locator('.ns-body p:not(.ns-place)');
    const ps = await body.evaluateAll((els) => els.map((e) => e.innerText.trim()));
    if (JSON.stringify(ps) === JSON.stringify(story.stars[i].paras.map(t))) ok++;
    if (i === 0) {
      await page.locator('.ns-stars .ns-star').nth(0).scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      await shot('2-star');
    }
  }
  record(g, '点开每颗星都能读到完整正文（不需要脚本）', ok === 6, `${ok}/6`);
  await page.locator('.ns-egg summary').tap();
  record(g, '隐藏的小星星可以点开', JSON.stringify(await textsOf(page, '.ns-egg .ns-body p')) === JSON.stringify(story.egg.paras.map(t)));

  const b = story.birthday;
  record(g, '生日祝福完整可读（主句未改动）', norm(await page.locator('.ns-bday .bday-hero').innerText()) === norm(t(b.hero)) &&
    JSON.stringify(await textsOf(page, '.ns-bday .bday-body p')) === JSON.stringify(b.paras.map(t)));
  await page.locator('.ns-light summary').scrollIntoViewIfNeeded();
  await page.locator('.ns-light summary').tap();
  await page.waitForTimeout(2600);
  record(g, '"点亮最后一颗星"按钮可用（纯 CSS）', (await page.locator('.ns-final').innerText()).trim() === t(b.lightDone) && (await page.locator('.ns-final').isVisible()));
  await page.locator('.ns-bday').scrollIntoViewIfNeeded();
  await page.evaluate(() => document.querySelector('.ns-bday').scrollIntoView());
  await shot('3-birthday');

  const e = story.ending;
  await page.evaluate(() => document.querySelector('.ns-end').scrollIntoView());
  await page.waitForTimeout(2500);
  record(g, '结尾文字完整', (await page.locator('.ns-end .end-title').innerText()) === t(e.title) &&
    (await page.locator('.ns-end .ns-foot').innerText()).trim() === t(e.footer));
  const anim = await page.locator('.ns-shoot').first().evaluate((el) => getComputedStyle(el).animationName);
  record(g, '结尾有流星动画（纯 CSS）', anim === 'ns-shoot', anim);
  await shot('4-end');
  const o = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  record(g, '无横向溢出', o);
  record(g, '没有任何网络请求', w.requests.length === 0, w.requests.slice(0, 3).join(' '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  fileSuite();
  await phoneSuite(browser, '安卓 Pixel 7 · 断网打开本地文件', 'Pixel 7', { offline: true, shots: 'android-412x915', backButton: true });
  await phoneSuite(browser, '安卓 Galaxy S9+ 小屏', 'Galaxy S9+', { offline: true });
  await phoneSuite(browser, 'iPhone 13 尺寸（Chromium 模拟）', 'iPhone 13', { offline: true, shots: 'iphone-390x844' });
  await phoneSuite(browser, '浏览器禁止存储时', 'Pixel 7', {
    init: () => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); } }),
  });
  await phoneSuite(browser, '系统开启"减少动画"', 'Pixel 7', { ctx: { reducedMotion: 'reduce' }, reduced: true });
  await staticSuite(browser, '不运行脚本 · iPhone 尺寸（模拟"文件"/微信预览）', 'iPhone 13', 'static-iphone-390x844');
  await staticSuite(browser, '不运行脚本 · 安卓尺寸', 'Pixel 7', null);
  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'results-offline.json'), JSON.stringify({ when: new Date().toISOString(), file: path.basename(HTML), pass, total: results.length, results }, null, 1));
  console.log(`\n${pass}/${results.length} 通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
