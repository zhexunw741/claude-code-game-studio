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
      const stars = s.stars
        .map(
          (st: any) =>
            `<article><h2>${esc(t(st.title))}</h2><p class="ns-date">${esc(st.date)}${st.place ? ' · ' + esc(t(st.place)) : ''}</p>` +
            st.paras.map((p: Txt) => `<p>${esc(t(p))}</p>`).join('') +
            '</article>',
        )
        .join('');
      const b = s.birthday;
      const e = s.ending;
      const noscript =
        `<div class="noscript-story"><h1>${esc(title)}</h1>${stars}` +
        `<article><h2>${esc(t(b.heading))}</h2><p>${esc(t(b.hero))}</p>${b.paras.map((p: Txt) => `<p>${esc(t(p))}</p>`).join('')}<p>${esc(t(b.lightDone))}</p></article>` +
        `<article><h2>${esc(t(e.title))}</h2><p>${esc(t(e.sub))}</p><p>${esc(t(e.footer))}</p></article></div>`;
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
  build: { target: 'es2018', cssTarget: 'safari13', assetsInlineLimit: 0, sourcemap: false },
  server: { host: true },
});
