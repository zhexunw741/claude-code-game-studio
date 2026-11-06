/**
 * 星空背景：2D Canvas，按屏幕面积控制星星数量、像素比上限 2、约 30fps，页面隐藏时暂停。
 * 三种状态：drift（闪烁）、converge（生日时星光汇聚，约 5.6 秒后自动回到 drift）、trails（结尾的缓慢星轨）。
 * 开启"减少动画"时只画静态画面。
 */
export type SkyMode = 'drift' | 'converge' | 'trails';

interface Star {
  x: number; // 0–1 相对坐标
  y: number;
  r: number;
  a: number;
  tw: number;
  ph: number;
  warm: boolean;
}

const FRAME_MS = 33;

export class Starfield {
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private mode: SkyMode = 'drift';
  private modeStart = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private focus = { x: 0.5, y: 0.3 };
  private beacon = false;

  private constructor(private canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, private reduced: boolean) {
    this.ctx = ctx;
  }

  static create(canvas: HTMLCanvasElement, reduced: boolean): Starfield | null {
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null;
    }
    if (!ctx) return null;
    const sf = new Starfield(canvas, ctx, reduced);
    sf.resize();
    return sf;
  }

  setReduced(reduced: boolean) {
    this.reduced = reduced;
    if (reduced) {
      this.stop();
      this.draw(performance.now());
    } else this.start();
  }

  /** 生日汇聚的目标点（相对视口 0–1） */
  setFocus(x: number, y: number) {
    this.focus = { x, y };
  }

  /** 汇聚结束后留在天上的那颗"最后的星" */
  setBeacon(on: boolean) {
    this.beacon = on;
    if (this.reduced) this.draw(performance.now());
  }

  setMode(mode: SkyMode) {
    this.mode = mode;
    this.modeStart = performance.now();
    if (this.reduced) this.draw(this.modeStart + (mode === 'converge' ? 2600 : 0));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr && this.stars.length) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.max(110, Math.min(380, Math.round((w * h) / 2400)));
    // 固定种子，窗口变化时星空不会"跳"成另一片
    let seed = 20261125;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    this.stars = Array.from({ length: count }, () => {
      const big = rnd() < 0.08;
      return {
        x: rnd(),
        y: Math.pow(rnd(), 1.25), // 上方略密
        r: big ? 0.9 + rnd() * 0.8 : 0.35 + rnd() * 0.55,
        a: big ? 0.75 + rnd() * 0.25 : 0.35 + rnd() * 0.45,
        tw: 0.6 + rnd() * 1.6,
        ph: rnd() * Math.PI * 2,
        warm: rnd() < 0.18,
      };
    });
    this.draw(performance.now());
  }

  start() {
    if (this.reduced) {
      this.draw(performance.now());
      return;
    }
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private loop = (ts: number) => {
    if (!this.running) return;
    if (ts - this.last >= FRAME_MS) {
      this.last = ts;
      this.draw(ts);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(now: number) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const t = now / 1000;
    const since = (now - this.modeStart) / 1000;

    if (this.mode === 'trails') {
      this.drawTrails(since);
      return;
    }

    // 汇聚进度：0→1（2.2s）停留（1.2s）1→0（2.2s）
    let p = 0;
    if (this.mode === 'converge') {
      if (since < 2.2) p = ease(since / 2.2);
      else if (since < 3.4) p = 1;
      else if (since < 5.6) p = 1 - ease((since - 3.4) / 2.2);
      else {
        this.mode = 'drift';
        p = 0;
      }
    }
    const fx = this.focus.x * w;
    const fy = this.focus.y * h;

    for (const s of this.stars) {
      let x = s.x * w;
      let y = s.y * h;
      if (p > 0) {
        const k = p * 0.78;
        x += (fx - x) * k;
        y += (fy - y) * k;
      }
      const tw = this.reduced ? 0.85 : 0.62 + 0.38 * Math.sin(t * s.tw + s.ph);
      ctx.globalAlpha = s.a * tw;
      ctx.fillStyle = s.warm ? '#EBD7AE' : '#F7F2E9';
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.beacon && p < 1) this.drawBeacon(fx, fy, (1 - p) * (this.reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 1.3)));
    if (p > 0) {
      const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, 70);
      g.addColorStop(0, `rgba(247,236,210,${0.85 * p})`);
      g.addColorStop(0.25, `rgba(229,205,158,${0.35 * p})`);
      g.addColorStop(1, 'rgba(197,167,122,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(fx, fy, 70, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawBeacon(x: number, y: number, a: number) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, `rgba(255,246,223,${0.9 * a})`);
    g.addColorStop(0.35, `rgba(226,201,152,${0.32 * a})`);
    g.addColorStop(1, 'rgba(197,167,122,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFF6DF';
    const r = 9;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** 星轨：绕视口上方一点缓慢旋转，弧长逐渐增长到上限 */
  private drawTrails(since: number) {
    const { ctx, w, h } = this;
    const cx = w * 0.5;
    const cy = h * 0.08;
    const speed = 0.045; // rad/s
    const rot = this.reduced ? 0 : since * speed;
    const len = this.reduced ? 0.32 : Math.min(0.34, 0.04 + since * 0.03);
    ctx.lineCap = 'round';
    this.stars.forEach((s, i) => {
      if (i % 2) return; // 只画一半，控制性能
      const dx = s.x * w - cx;
      const dy = s.y * h * 1.2 - cy;
      const r = Math.hypot(dx, dy);
      if (r < 8) return;
      const a0 = Math.atan2(dy, dx) + rot;
      ctx.globalAlpha = s.a * 0.55;
      ctx.strokeStyle = s.warm ? '#E2C998' : '#DCE3EE';
      ctx.lineWidth = Math.max(0.6, s.r);
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 - len, a0);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
