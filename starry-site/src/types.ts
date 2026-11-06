/** 文案项：纯字符串为界面文字；{ t, src } 为故事文字，src 记录来源（原稿页码 / 新增 / 任务书） */
export type Txt = string | { t: string; src?: string };

export interface StarItem {
  id: string;
  title: Txt;
  /** 显示用日期，如 2000.01.31 */
  date: string;
  /** 机器可读日期，用于 <time datetime> */
  dateISO?: string;
  place?: Txt;
  /** 星图中的位置（百分比，0–100） */
  x: number;
  y: number;
  paras: Txt[];
}

export interface Story {
  /** 文案规则：禁用的日期写法（正则字符串）与必须保持的日期，只供检查脚本与测试使用 */
  rules?: { forbiddenDates?: string[]; lockedDates?: { star: number; date: string; dateISO?: string }[] };
  meta: { pageTitle: string; description: string; lang?: string };
  intro: { title: Txt; subtitle: Txt; enter: string };
  sky: {
    heading: string;
    hint: Txt;
    /** 进度文字模板，{lit} 与 {total} 会被替换 */
    progress: string;
    birthdayDirect: string;
    birthdayReady: string;
  };
  card: { prev: string; next: string; back: string; closeLabel: string; toBirthday: string; litBadge: string };
  stars: StarItem[];
  egg?: { label: string; title: Txt; x: number; y: number; paras: Txt[] };
  birthday: {
    heading: Txt;
    date: string;
    hero: Txt;
    paras: Txt[];
    lightButton: string;
    lightDone: Txt;
    next: string;
    backToSky: string;
  };
  ending: { title: Txt; sub: Txt; bookRef: Txt; footer: Txt; again: string; backToSky: string };
}

export const txt = (v: Txt | undefined): string => (v === undefined ? '' : typeof v === 'string' ? v : v.t);
