// 文案检查（构建前自动运行）：
// 1. 结构：六颗星、坐标范围、必填字段
// 2. 日期红线：文案配置 rules.lockedDates 中的日期必须保持不变；rules.forbiddenDates 中的写法不得出现在任何文字里
// 3. （可选）来源核对：设置 MANUSCRIPT=原稿.txt 时，逐句核对标了原稿页码的文字是否出自原稿；
//    CORRECTIONS=订正.json（[{from,to}] 或含 corrections 字段的配置）会先套用到原稿；
//    EXTRA_SOURCES=文件1,文件2 可加入其他已确认文本（如 P40 衔接稿）
import fs from 'node:fs';
import { loadStory, collectTexts } from './story-path.mjs';

const { path: storyPath, story, isSample } = loadStory();
const errors = [];
const warns = [];
const err = (m) => errors.push(m);

// ---- 结构
if (!Array.isArray(story.stars) || story.stars.length !== 6) err(`stars 必须正好 6 颗，现在是 ${story.stars?.length}`);
const ids = new Set();
for (const [i, s] of (story.stars || []).entries()) {
  if (!s.id || ids.has(s.id)) err(`第 ${i + 1} 颗星 id 缺失或重复`);
  ids.add(s.id);
  if (!(s.x >= 5 && s.x <= 95 && s.y >= 5 && s.y <= 95)) err(`第 ${i + 1} 颗星坐标超出 5–95 范围`);
  if (!s.date) err(`第 ${i + 1} 颗星缺少日期`);
  if (!Array.isArray(s.paras) || s.paras.length < 1 || s.paras.length > 5) err(`第 ${i + 1} 颗星段落数应为 1–5`);
}
for (const k of ['intro', 'sky', 'card', 'birthday', 'ending']) if (!story[k]) err(`缺少 ${k}`);

// ---- 日期红线
const texts = collectTexts(story);
const rules = story.rules || {};
const forbiddenList = (rules.forbiddenDates || []).map((p) => new RegExp(p));
const isForbidden = (s) => forbiddenList.some((re) => re.test(s));
for (const x of texts) if (isForbidden(x.t)) err(`出现禁用的日期写法：${x.path} → ${x.t}`);
const rawNoRules = JSON.stringify({ ...story, rules: undefined });
if (isForbidden(rawNoRules)) err('配置中出现禁用的日期写法');
for (const L of rules.lockedDates || []) {
  const s = story.stars?.[L.star - 1];
  if (!s) err(`锁定日期指向不存在的第 ${L.star} 颗星`);
  else {
    if (s.date !== L.date) err(`第 ${L.star} 颗星日期必须是 ${L.date}，现在是 ${s.date}`);
    if (L.dateISO && s.dateISO !== L.dateISO) err(`第 ${L.star} 颗星 dateISO 必须是 ${L.dateISO}`);
  }
}
if (!isSample && !forbiddenList.length) warns.push('rules.forbiddenDates 为空：没有启用日期红线');

// ---- 来源核对
const strip = (s) => s.replace(/\s+/g, '');
if (process.env.MANUSCRIPT) {
  let corpus = fs.readFileSync(process.env.MANUSCRIPT, 'utf8');
  if (process.env.CORRECTIONS) {
    const c = JSON.parse(fs.readFileSync(process.env.CORRECTIONS, 'utf8'));
    const list = Array.isArray(c) ? c : c.corrections || [];
    // 与纪念册排版一致：每条订正按顺序替换一处
    for (const r of list) {
      if (!corpus.includes(r.from)) warns.push(`订正未命中原稿：${r.from}`);
      else corpus = corpus.replace(r.from, r.to);
    }
    if (isForbidden(corpus)) warns.push('套用订正后，原稿中仍有禁用的日期写法');
  }
  for (const f of (process.env.EXTRA_SOURCES || '').split(',').filter(Boolean)) corpus += '\n' + fs.readFileSync(f, 'utf8');
  const flat = strip(corpus);
  const report = [];
  for (const x of texts) {
    if (x.src === 'UI' || /新增|任务书|示例|书名/.test(x.src)) continue;
    const verbatim = flat.includes(strip(x.t));
    let status = verbatim ? '逐字' : '';
    if (!verbatim) {
      // 逐句、再逐分句核对：合并了原稿中相邻的句子，或省略了连接词
      const clauses = x.t.split(/[，。？！：；、]/).map(strip).filter((c) => c.length >= 2);
      const missing = clauses.filter((c) => !flat.includes(c));
      if (missing.length) err(`未在原稿中找到：${x.path}（${x.src}）缺少分句「${missing.join('」「')}」`);
      else status = '节选合并';
    }
    report.push({ path: x.path, src: x.src, status });
  }
  const n = (s) => report.filter((r) => r.status === s).length;
  console.log(`来源核对：${report.length} 条标注原稿来源的文字，逐字一致 ${n('逐字')} 条，原句节选或合并 ${n('节选合并')} 条`);
  if (process.env.SOURCE_REPORT) fs.writeFileSync(process.env.SOURCE_REPORT, JSON.stringify(report, null, 1));
} else if (!isSample) {
  warns.push('未设置 MANUSCRIPT，跳过与原稿的逐句核对');
}

console.log(`文案文件：${isSample ? '公开示例（占位文字）' : '私人文案'} ${isSample ? '' : storyPath}`);
warns.forEach((w) => console.warn('提示：' + w));
if (errors.length) {
  errors.forEach((e) => console.error('错误：' + e));
  process.exit(1);
}
console.log(`文案检查通过：${texts.length} 条文字；日期红线 ${forbiddenList.length} 条、锁定日期 ${(rules.lockedDates || []).length} 处均符合。`);
