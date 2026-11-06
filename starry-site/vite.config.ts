import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error 纯 JS 辅助模块
import { resolveStoryPath, projectRoot } from './scripts/story-path.mjs';

const storyPath: string = resolveStoryPath();

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
type Txt = string | { t: string };
const t = (v: Txt | undefined) => (v === undefined ? '' : typeof v === 'string' ? v : v.t);

/**
 * 把首屏文字直接写进 HTML（不等 JS 加载就能看到标题），并生成 <noscript> 里的完整故事列表作为降级版本。
 * 所有文案先做 HTML 转义，再写入页面。
 */
function storyHtml(): Plugin {
  return {
    name: 'story-html',
    transformIndexHtml(html) {
      const s = JSON.parse(fs.readFileSync(storyPath, 'utf8'));
      const title = t(s.intro.title);
      const [l1, l2] = title.includes('，') ? [title.slice(0, title.indexOf('，') + 1), title.slice(title.indexOf('，') + 1)] : [title, ''];
      const titleHtml = `<span class="line">${esc(l1)}</span>${l2 ? `<span class="line">${esc(l2)}</span>` : ''}`;
      const paras = (ps: Txt[]) => ps.map((p) => `<p>${esc(t(p))}</p>`).join('');
      // 无脚本版本（例如 iPhone"文件"或微信里的文件预览不运行 JavaScript）：
      // 只用 HTML 与 CSS——<details> 点开星星、点亮按钮、结尾的流星动画——文案与时间线与交互版相同。
      // 区块 id 与交互版路由同名（"/sky" 等），开场按钮 href="#/sky" 在无脚本时就跳到这里。
      const starItem = (st: any) =>
        `<li><details class="ns-star"><summary><span class="ns-dot" aria-hidden="true"></span>` +
        `<span class="ns-lab"><span class="ns-title">${esc(t(st.title))}</span><span class="ns-date">${esc(st.date)}</span></span></summary>` +
        `<div class="ns-body">${st.place ? `<p class="ns-place">${esc(t(st.place))}</p>` : ''}${paras(st.paras)}</div></details></li>`;
      const b = s.birthday;
      const e = s.ending;
      const noscript =
        `<div class="ns">` +
        `<section class="ns-sec ns-sky" id="/sky"><h2 class="ns-h">${esc(s.sky.heading)}</h2><p class="ns-hint">${esc(t(s.sky.hint))}</p>` +
        `<ol class="ns-stars">${s.stars.map(starItem).join('')}</ol>` +
        `<details class="ns-star ns-egg"><summary><span class="ns-dot" aria-hidden="true"></span><span class="ns-lab"><span class="ns-title">${esc(s.egg.label)}</span></span></summary>` +
        `<div class="ns-body">${paras(s.egg.paras)}</div></details></section>` +
        `<section class="ns-sec ns-bday" id="/birthday"><p class="eyebrow">${esc(b.date)}</p><h2 class="scene-title">${esc(t(b.heading))}</h2>` +
        `<div class="bday-hero"><p>${esc(t(b.hero))}</p></div><div class="bday-body">${paras(b.paras)}</div>` +
        `<details class="ns-light"><summary class="btn btn-primary">${esc(b.lightButton)}</summary>` +
        `<span class="ns-halo" aria-hidden="true"></span><p class="bday-final ns-final">${esc(t(b.lightDone))}</p></details></section>` +
        `<section class="ns-sec ns-end" id="/end"><span class="ns-shoot" aria-hidden="true"></span><span class="ns-shoot ns-shoot2" aria-hidden="true"></span>` +
        `<h2 class="end-title">${esc(t(e.title))}</h2><p class="end-sub">${esc(t(e.sub))}</p>` +
        `<p class="end-book">${esc(t(e.bookRef))}</p><p class="ns-foot">${esc(t(e.footer))}</p></section>` +
        `</div>`;
      const fontDir = path.join(projectRoot, 'public', 'fonts', 'generated');
      const hasFont = fs.existsSync(path.join(fontDir, 'serif-400.woff2'));
      const fontCss = hasFont
        ? `<link rel="preload" href="./fonts/generated/serif-400.woff2" as="font" type="font/woff2" crossorigin>` +
          `<style>@font-face{font-family:"StarSerif";src:url(./fonts/generated/serif-400.woff2) format("woff2");font-weight:400;font-display:swap}` +
          (fs.existsSync(path.join(fontDir, 'serif-500.woff2'))
            ? `@font-face{font-family:"StarSerif";src:url(./fonts/generated/serif-500.woff2) format("woff2");font-weight:500 700;font-display:swap}`
            : '') +
          `</style>`
        : '';
      return html
        .replace('%LANG%', esc(s.meta.lang || 'zh-CN'))
        .replace('%PAGE_TITLE%', esc(s.meta.pageTitle))
        .replace('%PAGE_DESC%', esc(s.meta.description))
        .replace('<!--FONT_FACES-->', fontCss)
        .replace('%INTRO_TITLE_HTML%', titleHtml)
        .replace('%INTRO_SUB%', esc(t(s.intro.subtitle)))
        .replace('%INTRO_ENTER%', esc(s.intro.enter))
        .replace('<!--NOSCRIPT_STORY-->', noscript);
    },
  };
}

export default defineConfig({
  base: './',
  resolve: { alias: { '@story': storyPath } },
  plugins: [storyHtml()],
  build: {
    target: 'es2018',
    cssTarget: 'safari13',
    assetsInlineLimit: 0,
    sourcemap: false,
    // 离线单文件版（OFFLINE=1）只有一个内联脚本，不需要 modulepreload 兼容代码
    modulePreload: process.env.OFFLINE === '1' ? false : { polyfill: true },
  },
  server: { host: true },
});
