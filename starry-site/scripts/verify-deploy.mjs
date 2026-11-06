// 上线后校验：检查一个已部署的网址是否能被浏览器当作网页打开，资源是否齐全，
// 线上文件是否与本地测试过的构建逐字节一致，以及 HTTPS 证书还剩多少天。
//
// 用法：
//   node scripts/verify-deploy.mjs https://你的域名/            # 只检查线上
//   DIST=/path/to/dist node scripts/verify-deploy.mjs https://…/  # 另与本地构建逐字节比对
//   OUT=report.json …                                             # 另写一份 JSON 结果
//   --allow-http   仅用于本机测试：允许 http:// 地址（正式地址必须是 HTTPS）
//
// 不需要任何云账号或密钥；只发 GET/HEAD 请求，不改动线上任何东西。
// 退出码：有 FAIL 时为 1，否则为 0。WARN 和 INFO 只是提醒。

import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import tls from 'node:tls';

const args = process.argv.slice(2);
const allowHttp = args.includes('--allow-http');
const target = args.find((a) => !a.startsWith('--'));
if (!target) {
  console.error('用法：node scripts/verify-deploy.mjs <网址> [--allow-http]');
  process.exit(2);
}

const results = [];
const record = (level, item, detail = '') => {
  results.push({ level, item, detail });
  console.log(`${level.padEnd(4)} ${item}${detail ? ' — ' + detail : ''}`);
};

const EXPECTED_TYPES = {
  '.html': [/^text\/html/],
  '.js': [/javascript/],
  '.css': [/^text\/css/],
  '.svg': [/^image\/svg\+xml/],
  '.woff2': [/^font\/woff2/, /^application\/font-woff2/, /^application\/x-font-woff2/],
};

const extOf = (p) => {
  const m = /\.[a-z0-9]+$/i.exec(p.split(/[?#]/)[0]);
  return m ? m[0].toLowerCase() : '';
};

function checkHeaders(label, res, path) {
  const cd = res.headers.get('content-disposition') || '';
  if (/attachment/i.test(cd)) {
    record('FAIL', `${label} 被要求下载而不是显示`, `Content-Disposition: ${cd}`);
  }
  const ct = res.headers.get('content-type') || '(无)';
  const expected = EXPECTED_TYPES[extOf(path) || '.html'];
  if (expected && !expected.some((re) => re.test(ct))) {
    // HTML 和脚本类型错误会让页面打不开；字体类型错误浏览器通常仍能加载。
    const level = extOf(path) === '.woff2' ? 'WARN' : 'FAIL';
    record(level, `${label} 的 Content-Type 不符合预期`, ct);
  }
  return ct;
}

async function get(url, init = {}) {
  return fetch(url, { redirect: 'follow', ...init, headers: { 'user-agent': 'starry-site-verify', ...(init.headers || {}) } });
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function listFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(p)));
    else out.push(p);
  }
  return out;
}

function certDaysLeft(host, port) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port, servername: host, timeout: 15000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return resolve({ error: '未取得证书' });
      const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000);
      resolve({ days, validTo: cert.valid_to, issuer: cert.issuer && (cert.issuer.O || cert.issuer.CN) });
    });
    socket.on('error', (e) => resolve({ error: e.message }));
    socket.on('timeout', () => { socket.destroy(); resolve({ error: '连接超时' }); });
  });
}

async function main() {
  let base;
  try {
    base = new URL(target);
  } catch {
    record('FAIL', '网址格式不正确', target);
    return;
  }
  if (base.protocol !== 'https:') {
    if (allowHttp) record('WARN', '不是 HTTPS 地址（仅本机测试可接受）', base.href);
    else record('FAIL', '正式地址必须是 HTTPS', base.href);
  }

  // 1. 首页
  let res;
  try {
    res = await get(base.href);
  } catch (e) {
    record('FAIL', '首页无法访问', String(e.cause?.message || e.message));
    return;
  }
  const finalUrl = new URL(res.url || base.href);
  if (finalUrl.href !== base.href) record('INFO', '首页发生跳转', `${base.href} → ${finalUrl.href}`);
  if (res.status !== 200) record('FAIL', '首页状态码不是 200', String(res.status));
  else record('PASS', '首页返回 200');
  const htmlCt = checkHeaders('首页', res, 'index.html');
  if (/^text\/html/.test(htmlCt) && !/attachment/i.test(res.headers.get('content-disposition') || '')) {
    record('PASS', '首页会以网页形式显示', htmlCt);
  }
  record('INFO', '首页 Cache-Control', res.headers.get('cache-control') || '(未设置)');
  const html = await res.text();

  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) record('PASS', '页面带 noindex（只是请搜索引擎不收录，不是访问控制）');
  else record('WARN', '页面没有 noindex 标记');

  // 2. 页面引用的资源
  const refs = new Set();
  for (const m of html.matchAll(/\s(?:src|href)=["']([^"']+)["']/g)) refs.add(m[1]);
  for (const m of html.matchAll(/url\(["']?([^"')]+)["']?\)/g)) refs.add(m[1]);
  const assets = [...refs].filter((r) => !/^(?:[a-z]+:|#|\/\/)/i.test(r));
  let assetFails = 0;
  for (const ref of assets) {
    const u = new URL(ref, finalUrl);
    let r;
    try {
      r = await get(u.href);
    } catch (e) {
      record('FAIL', `资源无法访问：${ref}`, String(e.cause?.message || e.message));
      assetFails++;
      continue;
    }
    if (r.status !== 200) {
      record('FAIL', `资源状态码不是 200：${ref}`, String(r.status));
      assetFails++;
    }
    const before = results.filter((x) => x.level === 'FAIL').length;
    checkHeaders(`资源 ${ref}`, r, u.pathname);
    if (results.filter((x) => x.level === 'FAIL').length > before) assetFails++;
    await r.arrayBuffer();
  }
  if (assets.length && !assetFails) record('PASS', `页面引用的 ${assets.length} 个资源都能正常取得`);
  if (!assets.length) record('WARN', '首页里没有找到任何本地资源引用');

  // 3. 与本地构建逐字节比对
  if (process.env.DIST) {
    const dist = process.env.DIST;
    const files = await listFiles(dist);
    let mismatches = 0;
    for (const f of files) {
      const rel = relative(dist, f).split(sep).join('/');
      const u = new URL(rel === 'index.html' ? './' : rel, finalUrl);
      let remote;
      try {
        const r = await get(u.href);
        if (r.status !== 200) {
          record('FAIL', `线上缺少文件：${rel}`, String(r.status));
          mismatches++;
          continue;
        }
        remote = Buffer.from(await r.arrayBuffer());
      } catch (e) {
        record('FAIL', `线上文件无法取得：${rel}`, String(e.cause?.message || e.message));
        mismatches++;
        continue;
      }
      const local = await readFile(f);
      if (sha256(local) !== sha256(remote)) {
        record('FAIL', `线上文件与本地构建不一致：${rel}`, `本地 ${local.length} B / 线上 ${remote.length} B`);
        mismatches++;
      }
    }
    if (!mismatches) record('PASS', `线上 ${files.length} 个文件与本地构建逐字节一致`);
  } else {
    record('INFO', '未设置 DIST，跳过与本地构建的逐字节比对');
  }

  // 4. HTTPS 证书剩余天数
  if (finalUrl.protocol === 'https:') {
    const c = await certDaysLeft(finalUrl.hostname, Number(finalUrl.port) || 443);
    if (c.error) record('FAIL', 'HTTPS 证书检查失败', c.error);
    else if (c.days < 0) record('FAIL', 'HTTPS 证书已过期', c.validTo);
    else if (c.days < 30) record('WARN', `HTTPS 证书只剩 ${c.days} 天，请尽快续期`, `${c.validTo}（${c.issuer || ''}）`);
    else record('PASS', `HTTPS 证书还剩 ${c.days} 天`, `${c.validTo}（${c.issuer || ''}）`);

    // 5. 有人手动输入 http:// 时会怎样（只记录，不判定）
    const httpUrl = new URL(finalUrl.href);
    httpUrl.protocol = 'http:';
    httpUrl.port = '';
    try {
      const r = await get(httpUrl.href, { redirect: 'manual' });
      const loc = r.headers.get('location');
      record('INFO', 'http:// 访问的结果', loc ? `${r.status} 跳转到 ${loc}` : `状态码 ${r.status}（未跳转到 HTTPS）`);
    } catch (e) {
      record('INFO', 'http:// 访问的结果', `无法连接：${e.cause?.message || e.message}`);
    }
  }
}

await main();

const count = (lv) => results.filter((r) => r.level === lv).length;
console.log(`\n结果：PASS ${count('PASS')} · FAIL ${count('FAIL')} · WARN ${count('WARN')} · INFO ${count('INFO')}`);
if (process.env.OUT) {
  await writeFile(process.env.OUT, JSON.stringify({ url: target, checkedAt: new Date().toISOString(), results }, null, 1));
}
process.exit(count('FAIL') ? 1 : 0);
