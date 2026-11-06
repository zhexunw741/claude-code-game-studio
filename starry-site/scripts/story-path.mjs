// 决定使用哪份故事文案：
// 1. 环境变量 STORY_CONTENT 指定的文件（推荐：私人文案放在仓库之外）
// 2. content/story.private.json（已被 .gitignore 排除）
// 3. content/story.sample.json（公开示例，只有占位文字）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function resolveStoryPath() {
  if (process.env.STORY_CONTENT) return path.resolve(process.env.STORY_CONTENT);
  const priv = path.join(projectRoot, 'content', 'story.private.json');
  if (fs.existsSync(priv)) return priv;
  return path.join(projectRoot, 'content', 'story.sample.json');
}

export function loadStory() {
  const p = resolveStoryPath();
  return { path: p, story: JSON.parse(fs.readFileSync(p, 'utf8')), isSample: p.endsWith('story.sample.json') };
}

/** 文案项可以是纯字符串（界面文字）或 { t, src }（故事文字，src 为来源页码或"新增"） */
export const textOf = (v) => (typeof v === 'string' ? v : v && typeof v.t === 'string' ? v.t : '');

/** 递归收集所有文字项：返回 [{ path, t, src }] */
export function collectTexts(node, at = '') {
  const out = [];
  if (typeof node === 'string') out.push({ path: at, t: node, src: 'UI' });
  else if (Array.isArray(node)) node.forEach((v, i) => out.push(...collectTexts(v, `${at}[${i}]`)));
  else if (node && typeof node === 'object') {
    if (typeof node.t === 'string') out.push({ path: at, t: node.t, src: node.src || '' });
    else for (const [k, v] of Object.entries(node)) {
      if (['id', 'x', 'y', 'dateISO', 'side', 'lang', 'noindex', 'rules', '_说明'].includes(k)) continue;
      out.push(...collectTexts(v, at ? `${at}.${k}` : k));
    }
  }
  return out;
}
