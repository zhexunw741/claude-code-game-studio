// 生成文案审核清单 STORY_CONTENT.md：列出全站每一句文字、日期与来源，标出"新增"句子供作者审核。
// 输出路径默认 ./STORY_CONTENT.md（已被 .gitignore 排除）；可用 OUT=路径 指定。
// SOURCE_REPORT=来源核对结果.json（由 check-content.mjs 生成）可选，用来标注"逐字 / 原句节选合并"。
import fs from 'node:fs';
import { loadStory, textOf } from './story-path.mjs';

const { story, isSample } = loadStory();
const report = process.env.SOURCE_REPORT && fs.existsSync(process.env.SOURCE_REPORT)
  ? Object.fromEntries(JSON.parse(fs.readFileSync(process.env.SOURCE_REPORT, 'utf8')).map((r) => [r.path, r.status]))
  : {};
const rows = [];
const line = (where, v, path) => {
  const t = textOf(v);
  const src = typeof v === 'string' ? '界面文字' : v.src || '';
  const isNew = /新增/.test(src);
  const st = report[path] ? `（${report[path]}）` : '';
  rows.push(`| ${where} | ${t.replace(/\|/g, '\\|')} | ${isNew ? '**新增 · 待确认**' : src + st} |`);
};

const out = [];
out.push(`# 星空网站文案清单${isSample ? '（示例）' : ''}`, '');
out.push('每一句都列出来源：原稿页码（P##）、**新增**（本次为网站新写，需要你确认）、任务书（你在任务书里给出的原话）、界面文字（按钮和提示）。');
out.push('"逐字"表示与原稿完全相同；"节选合并"表示把原稿中相邻的句子连在一起，或省略了个别连接词，字句仍出自原稿。', '');
out.push('| 位置 | 文字 | 来源 |', '|---|---|---|');
line('开场 · 主标题', story.intro.title, 'intro.title');
line('开场 · 引导语', story.intro.subtitle, 'intro.subtitle');
line('开场 · 按钮', story.intro.enter, 'intro.enter');
line('星图 · 提示', story.sky.hint, 'sky.hint');
line('星图 · 进度', story.sky.progress, 'sky.progress');
line('星图 · 生日入口', story.sky.birthdayDirect, 'sky.birthdayDirect');
line('星图 · 六星点亮后', story.sky.birthdayReady, 'sky.birthdayReady');
story.stars.forEach((s, i) => {
  line(`第${i + 1}颗星 · 标题`, s.title, `stars[${i}].title`);
  rows.push(`| 第${i + 1}颗星 · 日期 | ${s.date} | 时间线 |`);
  if (s.place) line(`第${i + 1}颗星 · 地点`, s.place, `stars[${i}].place`);
  s.paras.forEach((p, j) => line(`第${i + 1}颗星 · 第${j + 1}段`, p, `stars[${i}].paras[${j}]`));
});
if (story.egg) {
  line('隐藏星 · 名称', story.egg.label, 'egg.label');
  line('隐藏星 · 标题', story.egg.title, 'egg.title');
  story.egg.paras.forEach((p, j) => line(`隐藏星 · 第${j + 1}段`, p, `egg.paras[${j}]`));
}
const b = story.birthday;
line('生日 · 标题', b.heading, 'birthday.heading');
rows.push(`| 生日 · 日期 | ${b.date} | 时间线 |`);
line('生日 · 主句', b.hero, 'birthday.hero');
b.paras.forEach((p, j) => line(`生日 · 第${j + 1}段`, p, `birthday.paras[${j}]`));
line('生日 · 互动按钮', b.lightButton, 'birthday.lightButton');
line('生日 · 收尾句', b.lightDone, 'birthday.lightDone');
const e = story.ending;
line('结尾 · 大字', e.title, 'ending.title');
line('结尾 · 小字', e.sub, 'ending.sub');
line('结尾 · 书名', e.bookRef, 'ending.bookRef');
line('结尾 · 页脚', e.footer, 'ending.footer');
out.push(...rows, '');
const target = process.env.OUT || 'STORY_CONTENT.md';
fs.writeFileSync(target, out.join('\n'));
console.log('已生成', target, `（${rows.length} 行）`);
