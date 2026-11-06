# 星空网站（纪念册 P40 的延伸）

这是一页可以在手机上浏览的互动星空，是纸质纪念册的延伸：读到最后一页，扫码进入星空。

- 开场：标题和一个"进入"按钮。
- 星图：点亮六颗回忆星，每颗打开一张回忆卡片。
- 生日章节：任何时候都能直接进入，不必先点亮六颗星。
- 结尾：缓慢移动的星轨。

站点是纯静态的：没有后端、没有登录、不收集数据、不请求任何外部网址，也不播放声音。

> **隐私：** 本仓库是公开仓库，所以这里只有程序和**示例文案**（占位文字）。真实故事文案放在仓库之外，构建时用环境变量指定。用真实文案构建出的 `dist/` 同样含私人文字，不要提交，也不要放到公开地址。详见 [PRIVACY_CHECK.md](PRIVACY_CHECK.md)。

## 技术选择

使用 **Vite 7 + 原生 TypeScript**，没有用 React 之类的框架：六个互动节点用框架没有必要，原生实现的 JS 只有约 17 KB。

- 星空背景用 2D Canvas 绘制：设备像素比上限 2，星星数量按屏幕面积控制，约 30fps，页面隐藏时暂停。
- 页面切换用 hash 路由，手机返回键可用，每个场景都能直接用链接打开（`#/sky`、`#/star/3`、`#/birthday`、`#/end`）。
- 字体是从思源宋体（Noto Serif SC，SIL OFL）按本站实际用到的字生成的子集，约 65 KB/字重，放在本站自己的目录里，不依赖 Google Fonts 或任何 CDN。字体加载完成前先用系统宋体显示文字。

## 目录

```
starry-site/
├── index.html              页面骨架；首屏标题与无脚本降级内容在构建时写入
├── src/
│   ├── main.ts             场景、路由、星图、回忆卡片、生日、结尾
│   ├── starfield.ts        Canvas 星空（闪烁 / 生日汇聚 / 结尾星轨）
│   ├── styles.css          全部样式（含安全区、横屏、减少动画）
│   └── types.ts            文案数据结构
├── content/
│   └── story.sample.json   公开示例文案（占位）；真实文案不放这里
├── scripts/
│   ├── check-content.mjs   文案检查：结构、关键日期红线、（可选）与原稿逐句核对
│   ├── subset-fonts.mjs    生成字体子集
│   └── story-doc.mjs       生成文案审核清单 STORY_CONTENT.md
├── tests/e2e.cjs           真实浏览器端到端测试（Playwright）
├── public/                 图标；字体子集生成在 public/fonts/generated/（不入库）
└── README.md / TEST_REPORT.md / PRIVACY_CHECK.md / DEPLOY_GUIDE.md
```

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
cd starry-site
npm install
npm run dev          # 开发预览，终端会显示本机地址和局域网地址
```

手机和电脑连在同一个 Wi-Fi 时，用手机浏览器打开终端里显示的 `Network` 地址，就能在手机上预览。

### 使用真实文案

真实文案文件建议放在仓库之外，比如 `~/private/story.private.json`，然后：

```bash
STORY_CONTENT=~/private/story.private.json npm run dev
STORY_CONTENT=~/private/story.private.json npm run build
```

不设置 `STORY_CONTENT` 时，会依次查找 `content/story.private.json`（已被 `.gitignore` 排除），再退回到 `content/story.sample.json`。

### 构建与预览

```bash
npm run build        # 文案检查 → 字体子集 → 类型检查 → 生成 dist/
npm run preview      # 在本机预览 dist/（同样可以用手机打开局域网地址）
```

`dist/` 就是完整的静态网站，可以直接上传到任何静态托管服务。页面使用相对路径，放在子目录下也能正常打开。

## 修改文案

所有文字都在文案 JSON 里，代码中没有写死的故事内容。

- **星星**：`stars` 数组正好 6 项，字段如下：
  - `title` 标题，`date` 显示用日期，`dateISO` 机器可读日期，`place` 地点（可选）；
  - `x` / `y` 是星图中的位置（百分比，5–95）；
  - `paras` 是 1–5 段文字。
- **文字项写法**：可以写成纯字符串（界面文字），也可以写成 `{ "t": "文字", "src": "P05" }`。`src` 记录来源：原稿页码、`新增` 或 `任务书`。
- **其他部分**：`intro`（开场）、`sky`（星图提示、进度模板 `已点亮 {lit}/{total}`）、`card`（卡片按钮）、`egg`（隐藏星，可删除）、`birthday`、`ending`。

`npm run build` 会先运行文案检查，有问题就会中止构建：

- 必须正好六颗星，坐标在范围内；
- 全部文字不得出现 `rules.forbiddenDates` 中列出的日期写法（正则）；
- `rules.lockedDates` 中锁定的星星日期必须保持不变。日期规则写在文案配置里，公开代码中不出现具体日期。

可选：逐句核对文字是否出自原稿（原稿只在本机读取）。

```bash
STORY_CONTENT=… MANUSCRIPT=原稿.txt CORRECTIONS=订正.json EXTRA_SOURCES=已确认文本.txt npm run check
```

生成文案审核清单（列出每句话的来源，标出"新增"句子）：

```bash
STORY_CONTENT=… OUT=~/private/STORY_CONTENT.md npm run story-doc
```

## 测试

```bash
npm run build && npm run preview          # 先启动预览（默认端口 4173）
npm run test:e2e                          # 另开一个终端运行
```

真实文案的测试要使用同一份文案和产物：`STORY_CONTENT=… DIST=… OUT=~/private/test-output npm run test:e2e`。

测试会检查：

- 6 种屏幕尺寸（含横屏、桌面），手机尺寸用触摸点按；
- 键盘操作与 Esc、直达链接、返回键；
- 减少动画、Canvas 不可用、关闭 JavaScript 三种降级；
- 模拟 4G 下的首屏时间；
- 产物中没有错误日期和外部网址。

结果见 [TEST_REPORT.md](TEST_REPORT.md)。

## 部署

见 [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md)。正式发布前需要你先确认平台和公开内容；只有地址真实可访问、并在手机上实测之后，才生成纪念册 P40 的二维码。

## 版本

版本号写在 `package.json` 的 `version` 字段。当前 `0.1.0`：首个可运行版本，未部署。

## 常见问题

- **字体看起来不是宋体**：找不到源字体时，会跳过字体子集生成，退回系统字体。源字体默认取仓库 `纪念册/字体/`，也可以用 `FONT_SRC_DIR` 指定。改了文案要重新 `npm run build`，新字才会进入子集。
- **手机打不开开发地址**：确认手机和电脑在同一网络，并且电脑防火墙允许该端口。
- **想重新从 0 颗星开始**：点击结尾的"再看一次"。点亮状态只保存在当前浏览器标签页（sessionStorage）里，关闭标签页也会清空。
- **微信里打不开或出现提示**：与部署的域名有关，见 DEPLOY_GUIDE.md 中"中国大陆访问"一节。
