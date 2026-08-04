#!/usr/bin/env node
// 从 uutool.cn 同步违禁词库（每日自动运行）
// 用法: node scripts/sync_uutool.js [--out <dir>]
// 输出: word/xianyu-uutool.txt, word/douyin-uutool.txt, word/xiaohongshu-uutool.txt
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.dirname(path.dirname(__filename));
const OUT_DIR = process.argv.includes('--out')
  ? path.resolve(process.argv[process.argv.indexOf('--out') + 1])
  : path.join(ROOT, 'word');

const SOURCES = [
  {
    name: 'xianyu',
    url: 'https://uutool.cn/assets/js/tools/check-word.js',
    var: '_0x17df1c',
    out: 'xianyu-uutool.txt',
  },
  {
    name: 'douyin',
    url: 'https://uutool.cn/assets/js/tools/word-dy.js',
    var: '_0x117343',
    out: 'douyin-uutool.txt',
  },
  {
    name: 'xiaohongshu',
    url: 'https://uutool.cn/assets/js/tools/word-xhs.js',
    var: '_0x13ca7a',
    out: 'xiaohongshu-uutool.txt',
  },
];

function findExprEnd(code, start) {
  let i = start, inStr = null, paren = 0, sq = 0;
  for (; i < code.length; i++) {
    const c = code[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"') { inStr = c; continue; }
    if (c === '(') paren++;
    else if (c === ')') paren--;
    else if (c === '[') sq++;
    else if (c === ']') sq--;
    else if (c === ',' && paren === 0 && sq === 0) break;
  }
  return i;
}

function makeStubs() {
  const makeC = () => new Proxy(function () {}, {
    get: (t, p) => (p === Symbol.toPrimitive ? () => '' : p === Symbol.iterator ? undefined : makeC()),
    set: () => true,
    apply: () => makeC(),
    construct: () => makeC(),
  });
  const chain = () => makeC();
  const doc = new Proxy({
    createElement: chain, createElementNS: chain, createTextNode: chain,
    createDocumentFragment: chain,
    getElementById: () => chain(), querySelector: () => chain(), querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    documentElement: chain(), body: chain(), head: chain(),
    readyState: 'complete',
    location: { href: '', protocol: 'https:', search: '' },
    cookie: '',
  }, {
    get: (t, p) => (p in t ? t[p] : chain()),
    set: (t, p, v) => (t[p] = v, true),
  });
  const win = new Proxy({
    document: doc, navigator: { userAgent: 'node' }, location: doc.location,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    innerWidth: 1024, innerHeight: 768, screen: {},
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: () => Promise.resolve({ json: () => Promise.resolve({}), text: () => Promise.resolve('') }),
    XMLHttpRequest: function () {},
    Vue: function () {},
    layer: { msg() {}, open() {}, load() {} },
    QRCode: function () {},
  }, {
    get: (t, p) => (p in t ? t[p] : makeC()),
    set: (t, p, v) => (t[p] = v, true),
  });
  win.window = win; win.globalThis = win;
  doc.defaultView = win;
  return { doc, win, makeC };
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  for (const enc of ['utf-8', 'gbk', 'latin-1']) {
    try { return buf.toString(enc); } catch (e) { /* try next */ }
  }
  return buf.toString('utf-8');
}

function extract(code, wordVar) {
  const start = code.indexOf(wordVar + '=');
  if (start === -1) throw new Error('word var not found: ' + wordVar);
  const end = findExprEnd(code, start);
  const expr = code.slice(start, end);
  // 在 wordVar=... 表达式后注入捕获语句，把词串写到 globalThis
  const injected =
    code.slice(0, start) + expr +
    `;globalThis['__UUTOOL_WORDS__']=${wordVar};` +
    code.slice(end).replace(/^,/, 'var ');

  const { doc, win, makeC } = makeStubs();
  const context = vm.createContext({
    document: doc, window: win, globalThis: win, self: win, top: win,
    navigator: win.navigator, location: doc.location,
    setTimeout: win.setTimeout, setInterval: win.setInterval,
    clearTimeout: win.clearTimeout, clearInterval: win.clearInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    localStorage: win.localStorage, sessionStorage: win.sessionStorage,
    fetch: win.fetch, XMLHttpRequest: win.XMLHttpRequest,
    Vue: win.Vue, layer: win.layer, QRCode: win.QRCode,
    console, Buffer, process, require, module, exports, Math, JSON, Date,
  });
  try {
    vm.runInContext(injected, context, { filename: 'uutool.js' });
  } catch (e) {
    // 注入后剩余代码（如 new Vue 渲染）可能报错，忽略
  }
  const val = vm.runInContext("globalThis['__UUTOOL_WORDS__']", context);
  if (typeof val !== 'string') throw new Error('words not captured (type: ' + typeof val + ')');
  const words = [...new Set(val.split('|'))].filter((w) => w && w.trim());
  return words;
}

async function main() {
  let ok = 0, failed = 0;
  for (const src of SOURCES) {
    try {
      console.log(`[fetch] ${src.name} <- ${src.url}`);
      const code = await fetchText(src.url);
      const words = extract(code, src.var);
      const outPath = path.join(OUT_DIR, src.out);
      fs.writeFileSync(outPath, words.join('\n') + '\n', 'utf-8');
      console.log(`[ok] ${src.name}: ${words.length} 词 -> ${src.out}`);
      ok++;
    } catch (e) {
      console.error(`[fail] ${src.name}: ${e.message}`);
      failed++;
    }
  }
  console.log(`[done] 成功 ${ok}, 失败 ${failed}`);
  if (ok === 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
