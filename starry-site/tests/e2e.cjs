/* 端到端测试（真实浏览器）：先 `npm run build && npm run preview`，再运行本脚本。
 * 环境变量：BASE_URL（默认 http://localhost:4173/）、DIST（构建目录，用于扫描产物，默认 ./dist）、
 *           STORY_CONTENT（与构建时相同的文案文件）、OUT（结果与截图目录，默认 ./test-output）
 * 测试只从文案文件读取期望值，脚本本身不含任何故事文字。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const DIST = path.resolve(process.env.DIST || path.join(ROOT, 'dist'));
const OUT = path.resolve(process.env.OUT || path.join(ROOT, 'test-output'));
const storyPath = process.env.STORY_CONTENT
  ? path.resolve(process.env.STORY_CONTENT)
  : fs.existsSync(path.join(ROOT, 'content/story.private.json'))
    ? path.join(ROOT, 'content/story.private.json')
    : path.join(ROOT, 'content/story.sample.json');
const story = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
const t = (v) => (typeof v === 'string' ? v : v.t);
const isSample = storyPath.endsWith('story.sample.json');
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const results = [];
const record = (group, name, ok, detail = '') => {
  results.push({ group, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${detail ? ' — ' + detail : ''}`);
};
// 禁用日期写法与锁定日期来自文案配置 rules，脚本里不写具体日期
const FORBIDDEN_LIST = ((story.rules || {}).forbiddenDates || []).map((p) => new RegExp(p));
const FORBIDDEN = { test: (s) => FORBIDDEN_LIST.some((re) => re.test(s)) };
const LOCKED = (story.rules || {}).lockedDates || [];

const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, touch: true },
  { name: '375x812', width: 375, height: 812, touch: true },
  { name: '390x844', width: 390, height: 844, touch: true, shots: true },
  { name: '430x932', width: 430, height: 932, touch: true },
  { name: '844x390-横屏', width: 844, height: 390, touch: true },
  { name: '1280x800-桌面', width: 1280, height: 800, touch: false, shots: true },
];

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { ok: de.scrollWidth <= window.innerWidth + 1, scrollWidth: de.scrollWidth, innerWidth: window.innerWidth };
  });
}

async function press(page, locator, touch) {
  if (touch) await locator.tap();
  else await locator.click();
}

async function viewportSuite(browser, vp) {
  const g = `尺寸 ${vp.name}`;
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.shots ? 2 : 1,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
  });
  const shot = async (n) => vp.shots && page.screenshot({ path: path.join(OUT, 'shots', `${vp.name}-${n}.png`) });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const title = await page.locator('#intro-title').innerText();
  record(g, '首屏标题', title.replace(/\s/g, '') === t(story.intro.title).replace(/\s/g, ''), title.replace(/\n/g, ''));
  const enter = page.locator('#enter-btn');
  const eb = await enter.boundingBox();
  record(g, '首屏按钮可见且触控区 ≥44px', !!eb && eb.height >= 44 && eb.y + eb.height <= vp.height, eb ? `${Math.round(eb.width)}×${Math.round(eb.height)}` : '不可见');
  let o = await noHorizontalOverflow(page);
  record(g, '首屏无横向溢出', o.ok, `${o.scrollWidth}/${o.innerWidth}`);
  await page.waitForTimeout(900);
  await shot('1-intro');

  await press(page, enter, vp.touch);
  await page.waitForSelector('#scene-sky:not([hidden])');
  const stars = page.locator('.star');
  record(g, '六颗主星', (await stars.count()) === 6);
  const boxes = [];
  for (let i = 0; i < 6; i++) boxes.push(await stars.nth(i).boundingBox());
  const vw = vp.width;
  const inView = boxes.every((b) => b && b.x >= 0 && b.x + b.width <= vw + 0.5);
  record(g, '主星（含文字标签）都在屏幕宽度内', inView, boxes.map((b) => `${Math.round(b.x)}–${Math.round(b.x + b.width)}`).join(' '));
  record(g, '主星触控区 ≥44×44', boxes.every((b) => b.width >= 44 && b.height >= 44));
  let overlap = 0;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const a = boxes[i], b = boxes[j];
    const ix = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    if (ix * iy > 0) overlap++;
  }
  record(g, '主星之间互不遮挡', overlap === 0, `重叠 ${overlap} 对`);
  // 回归：星名曾因绝对定位按钮被容器宽度挤压而断成两行（如"写给新一 / 岁的你"）
  const wrapped = await page.locator('.star-title').evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height > parseFloat(getComputedStyle(e).lineHeight) * 1.5).map((e) => e.textContent));
  record(g, '星名不折行', wrapped.length === 0, wrapped.join('、'));
  const progress0 = await page.locator('.sky-progress').innerText();
  record(g, '进度初始为 0', progress0.includes('0/6'), progress0);
  record(g, '未点亮时不显示"六颗星都亮了"', !(await page.locator('.bday-ready').isVisible()));
  record(g, '"直接去看生日祝福"随时可用', await page.locator('.sky-foot .btn-ghost').isVisible());
  await page.waitForTimeout(700);
  await shot('2-sky');

  for (let i = 0; i < 6; i++) {
    const s = story.stars[i];
    await press(page, stars.nth(i), vp.touch);
    await page.waitForSelector('.card-layer:not([hidden]) .card');
    await page.waitForTimeout(450);
    const ct = await page.locator('#card-title').innerText();
    const meta = await page.locator('.card-meta').innerText();
    const card = await page.locator('.card').boundingBox();
    const navOk = await page.locator('.card-nav .btn').evaluateAll((els) => els.every((e) => e.getBoundingClientRect().height >= 44));
    const fits = card.x >= 0 && card.x + card.width <= vw + 0.5 && card.y >= -0.5 && card.y + card.height <= vp.height + 0.5;
    record(g, `第${i + 1}颗星卡片：标题、日期正确`, ct === t(s.title) && meta.includes(s.date), `${ct} / ${meta}`);
    record(g, `第${i + 1}颗星卡片在屏幕内、按钮 ≥44px`, fits && navOk, `${Math.round(card.width)}×${Math.round(card.height)}`);
    if (i === 0) await shot('3-card');
    await press(page, page.locator('.card-nav .btn-primary'), vp.touch);
    await page.waitForSelector('.card-layer', { state: 'hidden' });
  }
  const progress6 = await page.locator('.sky-progress').innerText();
  record(g, '六颗都点亮后进度 6/6', progress6.includes('6/6'), progress6);
  record(g, '六颗都点亮后出现生日入口', await page.locator('.bday-ready').isVisible());
  record(g, '连线数量 5', (await page.locator('.map-lines line').count()) === 5);
  await page.waitForTimeout(1500);
  await shot('4-sky-all');

  await press(page, page.locator('.bday-ready'), vp.touch);
  await page.waitForSelector('#scene-birthday:not([hidden])');
  record(g, '生日页标题与主句', (await page.locator('#birthday-heading').innerText()) === t(story.birthday.heading) &&
    (await page.locator('.bday-hero').innerText()).includes(t(story.birthday.hero).slice(0, 6)));
  record(g, '生日祝福无需互动即可完整阅读', await page.locator('.bday-final').isVisible());
  o = await noHorizontalOverflow(page);
  record(g, '生日页无横向溢出', o.ok, `${o.scrollWidth}/${o.innerWidth}`);
  await page.locator('#light-btn').scrollIntoViewIfNeeded();
  await press(page, page.locator('#light-btn'), vp.touch);
  record(g, '"点亮最后一颗星"互动生效', await page.locator('#scene-birthday.is-lit').count() === 1);
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('5-birthday');

  await page.goto(BASE + '#/end');
  await page.waitForSelector('#scene-end:not([hidden])');
  record(g, '结尾大字', (await page.locator('#end-heading').innerText()) === t(story.ending.title));
  record(g, '结尾页脚', (await page.locator('.end-foot').innerText()).trim() === t(story.ending.footer).trim());
  o = await noHorizontalOverflow(page);
  record(g, '结尾无横向溢出', o.ok, `${o.scrollWidth}/${o.innerWidth}`);
  await page.waitForTimeout(2500);
  await shot('6-end');

  const bodyText = await page.evaluate(() => document.body.innerText + document.title);
  record(g, '页面文字无禁用日期写法', !FORBIDDEN.test(bodyText), `规则 ${FORBIDDEN_LIST.length} 条`);
  record(g, '无脚本错误', errors.length === 0, errors.slice(0, 3).join(' | '));
  record(g, '无任何外部网络请求', external.length === 0, external.slice(0, 3).join(' '));
  await ctx.close();
}

async function keyboardSuite(browser) {
  const g = '键盘与弹层';
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '#/sky', { waitUntil: 'networkidle' });
  let reached = false;
  for (let i = 0; i < 6 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.classList.contains('star'));
  }
  record(g, 'Tab 可以聚焦到主星', reached);
  const ring = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  record(g, '聚焦时有可见焦点框', ring !== 'none', ring);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.card-layer:not([hidden])');
  record(g, 'Enter 打开卡片，焦点进入卡片', await page.evaluate(() => !!document.activeElement?.closest('.card')));
  let trapped = true;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('.card')))) trapped = false;
  }
  record(g, 'Tab 焦点保持在卡片内', trapped);
  record(g, '卡片 role=dialog、aria-modal、有标题', await page.evaluate(() => {
    const d = document.querySelector('.card');
    return d.getAttribute('role') === 'dialog' && d.getAttribute('aria-modal') === 'true' && !!document.getElementById(d.getAttribute('aria-labelledby'));
  }));
  record(g, '弹层打开时背景不可操作（inert）', await page.evaluate(() => document.getElementById('app').hasAttribute('inert')));
  await page.keyboard.press('Escape');
  await page.waitForSelector('.card-layer', { state: 'hidden' });
  record(g, 'Esc 关闭卡片，焦点回到星星', await page.evaluate(() => document.activeElement?.classList.contains('star')));
  await page.goto(BASE + '#/star/5');
  await page.waitForSelector('.card-layer:not([hidden])');
  const meta5 = await page.locator('.card-meta').innerText();
  record(g, '直接打开第五颗星链接', meta5.includes(story.stars[4].date), meta5);
  await page.locator('.card-nav .btn').nth(0).click();
  const prevOk = await page.waitForFunction((want) => document.getElementById('card-title')?.textContent === want, t(story.stars[3].title), { timeout: 3000 }).then(() => true, () => false);
  record(g, '"上一颗"切换到第四颗', prevOk, await page.locator('#card-title').innerText());
  await page.goto(BASE + '#/sky');
  await page.locator('.star').nth(1).click();
  await page.waitForSelector('.card-layer:not([hidden])');
  await page.goBack();
  await page.waitForSelector('.card-layer', { state: 'hidden' });
  record(g, '手机返回键（history.back）关闭卡片并留在星空', await page.locator('#scene-sky').isVisible());
  const page2 = await ctx.newPage();
  await page2.goto(BASE + '#/birthday', { waitUntil: 'networkidle' });
  record(g, '不经过星图也能直接看到生日祝福', await page2.locator('#scene-birthday').isVisible() && await page2.locator('.bday-hero').isVisible());
  const names = await page2.evaluate(() => {
    location.hash = '#/sky';
    return [...document.querySelectorAll('button, a[href]')].filter((e) => !(e.getAttribute('aria-label') || e.textContent.trim())).length;
  });
  record(g, '所有按钮与链接都有可读名称', names === 0, `无名称 ${names} 个`);
  await ctx.close();
}

async function degradeSuite(browser) {
  const g = '降级与动效';
  // 减少动画
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  let page = await ctx.newPage();
  await page.goto(BASE + '#/sky', { waitUntil: 'networkidle' });
  const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.star-core'), '::before').animationName);
  record(g, '减少动画：CSS 动画全部关闭', anim === 'none', anim);
  const drawn = await page.evaluate(() => {
    const c = document.getElementById('sky-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });
  record(g, '减少动画：星空静态绘制', drawn > 0, `${drawn} 个像素`);
  await page.locator('.star').nth(2).click();
  record(g, '减少动画：卡片仍可打开', await page.waitForSelector('.card-layer:not([hidden]) .card', { timeout: 3000 }).then(() => true, () => false));
  await ctx.close();
  // Canvas 不可用
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(BASE + '#/sky', { waitUntil: 'networkidle' });
  record(g, 'Canvas 不可用：显示静态星空', await page.evaluate(() => document.documentElement.classList.contains('no-canvas') && getComputedStyle(document.querySelector('.static-stars')).display === 'block'));
  await page.locator('.star').nth(4).click();
  const opened = await page.waitForSelector('.card-layer:not([hidden]) .card', { timeout: 3000 }).then(() => true, () => false);
  record(g, 'Canvas 不可用：六颗星仍可点击', opened && errs.length === 0, errs.join(' '));
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'shots', 'fallback-no-canvas.png') });
  await ctx.close();
  // 关闭 JavaScript
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  const ns = await page.evaluate(() => document.body.innerText);
  const all = story.stars.every((s) => ns.includes(t(s.title)));
  record(g, '关闭 JavaScript：首屏标题可见', ns.replace(/\s/g, '').includes(t(story.intro.title).replace(/\s/g, '')));
  record(g, '关闭 JavaScript：六段故事与生日祝福以纯文字列出', all && ns.includes(t(story.birthday.hero).slice(0, 6)));
  await page.screenshot({ path: path.join(OUT, 'shots', 'fallback-no-js.png'), fullPage: false });
  await ctx.close();
}

async function perfSuite(browser) {
  const g = '性能（模拟 4G）';
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (3 * 1024 * 1024) / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  let bytes = 0;
  page.on('response', async (r) => {
    try { bytes += (await r.body()).length; } catch {}
  });
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'load' });
  const loadMs = Date.now() - t0;
  const paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])));
  const fcp = paint['first-contentful-paint'];
  record(g, '首屏内容出现（FCP）', fcp !== undefined && fcp < 2500, `FCP ${fcp} ms；load ${loadMs} ms；4G 模拟 150ms 延迟、4Mbps、CPU 降速 4 倍`);
  await page.waitForTimeout(1500);
  record(g, '首次加载总传输量', bytes < 400 * 1024, `${(bytes / 1024).toFixed(1)} KB`);
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const s = performance.now();
    const f = () => { n++; if (performance.now() - s < 2000) requestAnimationFrame(f); else res(Math.round(n / 2)); };
    requestAnimationFrame(f);
  }));
  record(g, '降速后页面仍流畅（rAF 帧率）', fps >= 30, `${fps} fps（星空自身限制为约 30fps 绘制）`);
  await ctx.close();
}

function distSuite() {
  const g = '构建产物';
  if (!fs.existsSync(DIST)) return record(g, '找到构建目录', false, DIST);
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.join(d, e.name))));
  walk(DIST);
  const textFiles = files.filter((f) => /\.(html|js|css|json|txt|svg)$/.test(f));
  const bad = textFiles.filter((f) => FORBIDDEN.test(fs.readFileSync(f, 'utf8')));
  record(g, '产物中无禁用日期写法', FORBIDDEN_LIST.length > 0 || isSample ? bad.length === 0 : false, bad.join(' ') || `规则 ${FORBIDDEN_LIST.length} 条`);
  const ext = textFiles.filter((f) => /https?:\/\/(?!www\.w3\.org)/.test(fs.readFileSync(f, 'utf8')));
  record(g, '产物不引用任何外部网址（CDN、字体、统计）', ext.length === 0, ext.map((f) => path.basename(f)).join(' '));
  const imgs = files.filter((f) => /\.(png|jpe?g|webp|gif|heic|pdf|zip)$/i.test(f));
  record(g, '产物中没有照片、截图、PDF 或压缩包', imgs.length === 0, imgs.map((f) => path.basename(f)).join(' '));
  const js = textFiles.filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  record(g, '脚本不使用 innerHTML / eval 拼接内容', !/\.innerHTML\s*=|\beval\(|new Function\(/.test(js));
  const total = files.reduce((s, f) => s + fs.statSync(f).size, 0);
  record(g, '产物总大小', true, `${(total / 1024).toFixed(1)} KB，${files.length} 个文件`);
  const distIndex = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  for (const L of LOCKED) record(g, `锁定日期：第${L.star}颗星（文案与产物一致）`, story.stars[L.star - 1].date === L.date && distIndex.includes(L.date));
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) await viewportSuite(browser, vp);
    await keyboardSuite(browser);
    await degradeSuite(browser);
    await perfSuite(browser);
    distSuite();
  } catch (e) {
    record('运行', '测试过程异常', false, String(e && e.stack || e).slice(0, 400));
  } finally {
    await browser.close();
  }
  const pass = results.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), base: BASE, content: isSample ? 'sample' : 'private', pass, total: results.length, results }, null, 1));
  console.log(`\n${pass}/${results.length} 项通过`);
  process.exit(pass === results.length ? 0 : 1);
})();
