import './styles.css';
import story from '@story';
import { txt, type Txt } from './types';
import { Starfield } from './starfield';

/* ---------------------------------------------------------------- 小工具 */
type Attrs = Record<string, string | number | boolean | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | undefined)[]) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'text') n.textContent = String(v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined) n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const paras = (list: Txt[], cls = '') => list.map((p) => el('p', { class: cls || undefined, text: txt(p) }));
const fmt = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
/** 清空后放入子节点。等同 replaceChildren，但兼容 Chrome 86 / Safari 14 以前的浏览器与旧版安卓 WebView。 */
const setChildren = (parent: Element, ...nodes: Node[]) => {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  nodes.forEach((n) => parent.appendChild(n));
};

/* ---------------------------------------------------------------- 已点亮状态（只存在本次会话） */
const LIT_KEY = 'starry:lit';
const lit = new Set<number>();
try {
  const raw = sessionStorage.getItem(LIT_KEY);
  if (raw) (JSON.parse(raw) as number[]).forEach((i) => lit.add(i));
} catch {
  /* 隐私模式等情况下 sessionStorage 不可用：只在内存里记 */
}
const saveLit = () => {
  try {
    sessionStorage.setItem(LIT_KEY, JSON.stringify([...lit]));
  } catch {
    /* ignore */
  }
};

/* ---------------------------------------------------------------- 星空背景 */
const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let reduced = !!motionQuery?.matches;
const canvas = $('#sky-canvas') as unknown as HTMLCanvasElement;
const sky = Starfield.create(canvas, reduced);
document.documentElement.classList.add('js');
if (!sky) document.documentElement.classList.add('no-canvas');
else sky.start();

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => sky?.resize(), 150);
});
document.addEventListener('visibilitychange', () => (document.hidden ? sky?.stop() : sky?.start()));
const onMotionChange = () => {
  reduced = !!motionQuery?.matches;
  sky?.setReduced(reduced);
};
motionQuery?.addEventListener ? motionQuery.addEventListener('change', onMotionChange) : motionQuery?.addListener(onMotionChange);

/* ---------------------------------------------------------------- 场景：星图 */
const total = story.stars.length;
const skyScene = $('#scene-sky');
const progress = el('p', { class: 'sky-progress', 'aria-live': 'polite' });
const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
lines.setAttribute('class', 'map-lines');
lines.setAttribute('viewBox', '0 0 100 100');
lines.setAttribute('preserveAspectRatio', 'none');
lines.setAttribute('aria-hidden', 'true');
const starButtons: HTMLButtonElement[] = [];

const map = el('div', { class: 'map', role: 'group', 'aria-label': story.sky.heading });
map.append(lines);
story.stars.forEach((s, i) => {
  const b = el(
    'button',
    {
      class: `star ${s.x > 55 ? 'label-left' : 'label-right'}`,
      type: 'button',
      style: `left:${s.x}%;top:${s.y}%`,
      'data-i': i,
    },
    el('span', { class: 'star-core', 'aria-hidden': 'true' }),
    el(
      'span',
      { class: 'star-label' },
      el('span', { class: 'star-title', text: txt(s.title) }),
      el('span', { class: 'star-date', text: s.date }),
    ),
  );
  b.addEventListener('click', () => go(`#/star/${i + 1}`));
  starButtons.push(b);
  map.append(b);
});
let eggButton: HTMLButtonElement | null = null;
if (story.egg) {
  eggButton = el('button', {
    class: 'egg',
    type: 'button',
    style: `left:${story.egg.x}%;top:${story.egg.y}%`,
    'aria-label': story.egg.label,
  });
  eggButton.append(el('span', { class: 'egg-core', 'aria-hidden': 'true' }));
  eggButton.addEventListener('click', () => go('#/egg'));
  map.append(eggButton);
}
const bdayReady = el('a', { class: 'btn btn-primary bday-ready', href: '#/birthday', hidden: true, text: story.sky.birthdayReady });
const bdayDirect = el('a', { class: 'btn btn-ghost', href: '#/birthday', text: story.sky.birthdayDirect });
skyScene.append(
  el(
    'header',
    { class: 'sky-head' },
    el('h2', { id: 'sky-heading', class: 'visually-hidden', tabindex: -1, text: story.sky.heading }),
    el('p', { class: 'sky-hint', text: txt(story.sky.hint) }),
    progress,
  ),
  map,
  el('footer', { class: 'sky-foot' }, bdayReady, bdayDirect),
);

function renderLit() {
  progress.textContent = fmt(story.sky.progress, { lit: lit.size, total });
  starButtons.forEach((b, i) => {
    const on = lit.has(i);
    b.classList.toggle('is-lit', on);
    const s = story.stars[i];
    b.setAttribute('aria-label', `${i + 1}/${total} ${txt(s.title)}，${s.date}${on ? '，' + story.card.litBadge : ''}`);
  });
  // 连线：相邻两颗都点亮时才画
  setChildren(lines);
  for (let i = 0; i < total - 1; i++) {
    if (!(lit.has(i) && lit.has(i + 1))) continue;
    const a = story.stars[i];
    const b = story.stars[i + 1];
    const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ln.setAttribute('x1', String(a.x));
    ln.setAttribute('y1', String(a.y));
    ln.setAttribute('x2', String(b.x));
    ln.setAttribute('y2', String(b.y));
    lines.append(ln);
  }
  const all = lit.size >= total;
  bdayReady.hidden = !all;
  bdayDirect.hidden = all;
  skyScene.classList.toggle('all-lit', all);
}

/* ---------------------------------------------------------------- 回忆卡片（对话框） */
const layer = $('#card-layer');
const app = $('#app');
let lastFocus: HTMLElement | null = null;
let cameFromSky = false;

function openCard(kind: 'star' | 'egg', index = 0) {
  const isStar = kind === 'star';
  const s = isStar ? story.stars[index] : null;
  const egg = story.egg;
  const title = isStar ? txt(s!.title) : txt(egg?.title);
  const body = isStar ? s!.paras : egg?.paras || [];
  const meta = isStar
    ? el('p', { class: 'card-meta' }, el('time', { datetime: s!.dateISO || undefined, text: s!.date }), s!.place ? ` · ${txt(s!.place)}` : '')
    : el('p', { class: 'card-meta', text: egg?.label || '' });

  const nav = el('nav', { class: 'card-nav', 'aria-label': story.card.back });
  if (isStar) {
    const prev = el('button', { type: 'button', class: 'btn btn-ghost', text: story.card.prev, disabled: index === 0 });
    const next = el('button', { type: 'button', class: 'btn btn-ghost', text: story.card.next, disabled: index === total - 1 });
    prev.addEventListener('click', () => go(`#/star/${index}`, true));
    next.addEventListener('click', () => go(`#/star/${index + 2}`, true));
    nav.append(prev);
    const back = el('button', { type: 'button', class: 'btn btn-primary', text: story.card.back });
    back.addEventListener('click', closeCard);
    nav.append(back, next);
  } else {
    const back = el('button', { type: 'button', class: 'btn btn-primary', text: story.card.back });
    back.addEventListener('click', closeCard);
    nav.append(back);
  }

  const extra =
    isStar && index === total - 1
      ? el('p', { class: 'card-extra' }, el('a', { class: 'btn btn-primary', href: '#/birthday', text: story.card.toBirthday }))
      : null;

  const close = el('button', { type: 'button', class: 'card-close', 'aria-label': story.card.closeLabel }, el('span', { 'aria-hidden': 'true', text: '×' }));
  close.addEventListener('click', closeCard);

  const card = el(
    'div',
    { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'card-title' },
    close,
    meta,
    el('h2', { id: 'card-title', class: 'card-title', tabindex: -1, text: title }),
    el('div', { class: 'card-body' }, ...paras(body)),
    extra,
    nav,
  );
  const backdrop = el('div', { class: 'card-backdrop', 'aria-hidden': 'true' });
  backdrop.addEventListener('click', closeCard);
  setChildren(layer, backdrop, card);
  if (layer.hidden) lastFocus = (document.activeElement as HTMLElement) || null;
  layer.hidden = false;
  app.setAttribute('inert', '');
  app.setAttribute('aria-hidden', 'true');
  requestAnimationFrame(() => layer.classList.add('is-open'));
  ($('#card-title') as HTMLElement).focus({ preventScroll: true });

  if (isStar && !lit.has(index)) {
    lit.add(index);
    saveLit();
    renderLit();
  }
}

function hideCard() {
  if (layer.hidden) return;
  layer.classList.remove('is-open');
  layer.hidden = true;
  setChildren(layer);
  app.removeAttribute('inert');
  app.removeAttribute('aria-hidden');
}

function closeCard() {
  if (cameFromSky) history.back();
  else go('#/sky', true);
}

layer.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCard();
    return;
  }
  if (e.key !== 'Tab') return;
  const items = [...layer.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]')];
  if (!items.length) return;
  const first = items[0];
  const lastItem = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === $('#card-title'))) {
    e.preventDefault();
    lastItem.focus();
  } else if (!e.shiftKey && document.activeElement === lastItem) {
    e.preventDefault();
    first.focus();
  }
});

/* ---------------------------------------------------------------- 场景：生日 */
const bdayScene = $('#scene-birthday');
const b = story.birthday;
const lightBtn = el('button', { type: 'button', class: 'btn btn-primary', id: 'light-btn', text: b.lightButton });
lightBtn.addEventListener('click', () => {
  bdayScene.classList.add('is-lit');
  // 星光汇聚到天空上方（不压在文字后面），之后留下一颗常亮的星
  sky?.setFocus(0.5, 0.075);
  sky?.setMode('converge');
  sky?.setBeacon(true);
});
bdayScene.append(
  el(
    'div',
    { class: 'scene-inner bday-inner' },
    el('p', { class: 'eyebrow' }, el('time', { text: b.date })),
    el('h2', { id: 'birthday-heading', class: 'scene-title', tabindex: -1, text: txt(b.heading) }),
    el('blockquote', { class: 'bday-hero' }, el('p', { text: txt(b.hero) })),
    el('div', { class: 'bday-body' }, ...paras(b.paras)),
    el('div', { class: 'bday-light' }, lightBtn, el('p', { class: 'bday-final', text: txt(b.lightDone) })),
    el(
      'nav',
      { class: 'scene-nav' },
      el('a', { class: 'btn btn-primary', href: '#/end', text: b.next }),
      el('a', { class: 'btn btn-ghost', href: '#/sky', text: b.backToSky }),
    ),
  ),
);

/* ---------------------------------------------------------------- 场景：结尾 */
const endScene = $('#scene-end');
const e = story.ending;
const again = el('a', { class: 'btn btn-ghost', href: '#/', text: e.again });
again.addEventListener('click', () => {
  lit.clear();
  saveLit();
  renderLit();
});
endScene.append(
  el(
    'div',
    { class: 'scene-inner end-inner' },
    el('h2', { id: 'end-heading', class: 'end-title', tabindex: -1, text: txt(e.title) }),
    el('p', { class: 'end-sub', text: txt(e.sub) }),
    el('p', { class: 'end-book', text: txt(e.bookRef) }),
    el('nav', { class: 'scene-nav' }, again, el('a', { class: 'btn btn-primary', href: '#/sky', text: e.backToSky })),
  ),
  el('footer', { class: 'end-foot', text: txt(e.footer) }),
);

/* ---------------------------------------------------------------- 路由 */
type Scene = 'intro' | 'sky' | 'birthday' | 'end';
const scenes: Record<Scene, HTMLElement> = {
  intro: $('#scene-intro'),
  sky: skyScene,
  birthday: bdayScene,
  end: endScene,
};
let current: Scene | null = null;

function go(hash: string, replace = false) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

function parse(hash: string): { scene: Scene; star?: number; egg?: boolean } {
  const m = hash.match(/^#\/star\/(\d+)$/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= total) return { scene: 'sky', star: n - 1 };
    return { scene: 'sky' };
  }
  if (hash === '#/egg' && story.egg) return { scene: 'sky', egg: true };
  if (hash === '#/sky') return { scene: 'sky' };
  if (hash === '#/birthday') return { scene: 'birthday' };
  if (hash === '#/end') return { scene: 'end' };
  return { scene: 'intro' };
}

function showScene(name: Scene, focus: boolean) {
  if (current === name) return;
  const prev = current;
  current = name;
  (Object.keys(scenes) as Scene[]).forEach((k) => {
    const on = k === name;
    scenes[k].hidden = !on;
    scenes[k].classList.toggle('is-active', on);
  });
  document.body.dataset.scene = name;
  sky?.setMode(name === 'end' ? 'trails' : 'drift');
  if (name !== 'birthday') {
    bdayScene.classList.remove('is-lit');
    sky?.setBeacon(false);
  }
  window.scrollTo(0, 0);
  if (focus && prev !== null) {
    const h = scenes[name].querySelector<HTMLElement>('h1, h2');
    h?.focus({ preventScroll: true });
  }
}

let prevRoute = parse(location.hash);
function route(initial = false) {
  const r = parse(location.hash);
  cameFromSky = !initial && r.scene === 'sky' && (r.star !== undefined || !!r.egg) && (prevRoute.scene === 'sky' || cameFromSky);
  if (r.star === undefined && !r.egg) cameFromSky = false;
  showScene(r.scene, !initial);
  if (r.star !== undefined) openCard('star', r.star);
  else if (r.egg) openCard('egg');
  else {
    const wasOpen = !layer.hidden;
    hideCard();
    if (wasOpen && r.scene === 'sky') {
      const target = lastFocus && document.contains(lastFocus) ? lastFocus : starButtons[0];
      target?.focus({ preventScroll: true });
    }
  }
  prevRoute = r;
}

window.addEventListener('hashchange', () => route());
renderLit();
route(true);
document.documentElement.classList.add('ready');
