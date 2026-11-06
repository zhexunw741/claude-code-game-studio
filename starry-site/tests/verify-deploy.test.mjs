// verify-deploy.mjs 的回归测试：在本机起几个模拟"线上"的服务器，确认脚本
// 在正常情况下通过，在对象存储默认域名那类"强制下载"的情况下报 FAIL，
// 线上文件被换掉时报 FAIL，并能读出 HTTPS 证书的剩余天数。
// 不访问外网；用临时目录里的假站点，不涉及任何真实文案。
//
// 运行：node tests/verify-deploy.test.mjs

import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'scripts', 'verify-deploy.mjs');
const work = mkdtempSync(join(tmpdir(), 'verify-deploy-'));

// 假站点：结构与真实构建相同（相对路径资源 + 内联 @font-face）。
const site = join(work, 'site');
mkdirSync(join(site, 'assets'), { recursive: true });
mkdirSync(join(site, 'fonts'), { recursive: true });
writeFileSync(join(site, 'index.html'), `<!doctype html><html><head>
<meta name="robots" content="noindex, nofollow, noarchive">
<link rel="icon" href="./favicon.svg">
<style>@font-face{font-family:X;src:url(./fonts/x.woff2) format('woff2')}</style>
<script type="module" src="./assets/app.js"></script>
<link rel="stylesheet" href="./assets/app.css">
</head><body><a href="#/sky">进入</a></body></html>`);
writeFileSync(join(site, 'assets', 'app.js'), 'console.log(1)');
writeFileSync(join(site, 'assets', 'app.css'), 'body{color:#fff}');
writeFileSync(join(site, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
writeFileSync(join(site, 'fonts', 'x.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32]));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const handler = (root, { forceDownload = false } = {}) => (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = readFileSync(join(root, p));
    const headers = { 'content-type': TYPES[extname(p)] || 'application/octet-stream' };
    if (forceDownload) {
      // 模拟对象存储默认域名：HTML 以附件形式返回
      headers['content-type'] = 'application/octet-stream';
      headers['content-disposition'] = 'attachment';
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
};
const listen = (server) => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));

// 必须异步起子进程：同步调用会卡住本进程的事件循环，模拟服务器就无法应答。
const run = (url, env = {}, extra = []) => new Promise((resolve) => {
  const child = spawn(process.execPath, [script, url, ...extra], { env: { ...process.env, ...env } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (code) => resolve({ code, out }));
});

let failures = 0;
const expect = (name, cond, out) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}`);
  if (!cond) { failures++; console.log(out); }
};

const good = createServer(handler(site));
const bad = createServer(handler(site, { forceDownload: true }));
const goodPort = await listen(good);
const badPort = await listen(bad);

// 1. 正常站点 + 逐字节比对：通过
let r = await run(`http://127.0.0.1:${goodPort}/`, { DIST: site }, ['--allow-http']);
expect('正常站点通过', r.code === 0 && /PASS 首页会以网页形式显示/.test(r.out) && /4 个资源都能正常取得/.test(r.out) && /5 个文件与本地构建逐字节一致/.test(r.out), r.out);

// 2. 不带 --allow-http 的 http 地址：失败
r = await run(`http://127.0.0.1:${goodPort}/`);
expect('http 正式地址被拒', r.code === 1 && /正式地址必须是 HTTPS/.test(r.out), r.out);

// 3. 强制下载（对象存储默认域名的情况）：失败
r = await run(`http://127.0.0.1:${badPort}/`, {}, ['--allow-http']);
expect('强制下载被识别', r.code === 1 && /首页 被要求下载而不是显示/.test(r.out), r.out);

// 4. 线上文件与本地构建不一致：失败
const changed = join(work, 'changed');
cpSync(site, changed, { recursive: true });
writeFileSync(join(changed, 'assets', 'app.js'), 'console.log(2)');
r = await run(`http://127.0.0.1:${goodPort}/`, { DIST: changed }, ['--allow-http']);
expect('文件不一致被识别', r.code === 1 && /线上文件与本地构建不一致：assets\/app\.js/.test(r.out), r.out);

// 5. 缺资源：失败
const missing = join(work, 'missing');
cpSync(site, missing, { recursive: true });
rmSync(join(missing, 'assets', 'app.css'));
const holey = createServer(handler(missing));
const holeyPort = await listen(holey);
r = await run(`http://127.0.0.1:${holeyPort}/`, {}, ['--allow-http']);
expect('缺少资源被识别', r.code === 1 && /资源状态码不是 200：\.\/assets\/app\.css/.test(r.out), r.out);

// 6. HTTPS：读出证书剩余天数（本机自签证书，经 NODE_EXTRA_CA_CERTS 信任，不关闭校验）
let httpsServer;
try {
  const key = join(work, 'key.pem');
  const cert = join(work, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '20',
    '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'], { stdio: 'ignore' });
  httpsServer = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, handler(site));
  const port = await new Promise((res) => httpsServer.listen(0, 'localhost', () => res(httpsServer.address().port)));
  r = await run(`https://localhost:${port}/`, { NODE_EXTRA_CA_CERTS: cert, DIST: site });
  // 证书只签了 20 天，应当给出 WARN（少于 30 天），但不算失败
  expect('HTTPS 证书天数可读且临期提醒', r.code === 0 && /WARN HTTPS 证书只剩 1?\d 天/.test(r.out), r.out);
} catch (e) {
  console.log('skip HTTPS 用例（本机没有 openssl）：', e.message);
}

good.close(); bad.close(); holey.close(); httpsServer?.close();
rmSync(work, { recursive: true, force: true });
console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
