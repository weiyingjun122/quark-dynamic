// functions/api/qq/callback.js
// QQ机器人开放平台 Webhook 回调
// op:13  回调地址验证（Bot Secret 派生 Ed25519 签名）
// op:0   事件推送（校验 X-Signature-Ed25519 头）
// 回包   {d:{}, op:12} HTTP Callback ACK
// @消息/单聊 → 查 D1 resources → 被动回复网盘链接
// GROUP_MESSAGE_CREATE 全量群消息 → 广告检测（撤回+计数，3次禁言10分钟，5次踢人+拉黑）
// 日志落 qq_logs 表

const enc = new TextEncoder();

const PKCS8_PREFIX = (() => {
  const h = '302e020100300506032b657004220420';
  const b = new Uint8Array(h.length / 2);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return b;
})();

// 与 QQ 官方 Go 参考实现一致：secret 字节序列倍增至 >=32 字节后取前 32 字节作 Ed25519 seed
function seedFromSecret(secret) {
  let s = enc.encode(secret);
  if (!s.length) throw new Error('empty secret');
  while (s.length < 32) {
    const n = new Uint8Array(s.length * 2);
    n.set(s, 0);
    n.set(s, s.length);
    s = n;
  }
  return s.slice(0, 32);
}

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function edKey(secret) {
  const seed = seedFromSecret(secret);
  const der = new Uint8Array(PKCS8_PREFIX.length + seed.length);
  der.set(PKCS8_PREFIX);
  der.set(seed, PKCS8_PREFIX.length);
  return crypto.subtle.importKey('pkcs8', der, { name: 'Ed25519' }, false, ['sign']);
}

async function edSign(secret, msgBytes) {
  const key = await edKey(secret);
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, msgBytes);
  return bufToHex(sig);
}

// Ed25519 签名是确定性的，重签比对等价于验签（免从 seed 派生公钥）
async function edVerify(secret, sigHex, msgBytes) {
  let expect, actual;
  try {
    expect = (await edSign(secret, msgBytes)).toLowerCase();
    actual = (sigHex || '').toLowerCase();
  } catch (e) {
    return false;
  }
  if (expect.length !== 128 || actual.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < expect.length; i++) diff |= expect.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

async function logEvent(env, kind, f) {
  try {
    console.log(JSON.stringify({ kind, sigOk: f.sigOk, event: f.event, from: f.fromUser, note: f.note, body: (f.body || '').slice(0, 300) }));
    if (env.RESOURCES_DB) {
      await env.RESOURCES_DB.prepare(
        'INSERT INTO qq_logs (kind, sig_ok, event, from_user, body, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        kind,
        f.sigOk ? 1 : 0,
        (f.event || '').slice(0, 40),
        (f.fromUser || '').slice(0, 64),
        (f.body || '').slice(0, 800),
        (f.note || '').slice(0, 300)
      ).run();
    }
  } catch (e) {
    console.log('logEvent failed: ' + (e && e.message));
  }
}

async function getAccessToken(env) {
  const now = Date.now();
  const c = globalThis.__qq_access_token;
  if (c && c.exp > now + 30000) return c.tok;
  const r = await fetch('https://api.bot.qq.com/app/getAppAccessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: env.QQ_APPID, clientSecret: env.QQ_APP_SECRET })
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('get token fail code=' + j.code + ' msg=' + j.message);
  globalThis.__qq_access_token = { tok: j.access_token, exp: now + (Number(j.expires_in) || 7200) * 1000 };
  return j.access_token;
}

async function qqPost(env, path, body) {
  const tok = await getAccessToken(env);
  const r = await fetch('https://api.bot.qq.com' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'QQBot ' + tok },
    body: JSON.stringify(body)
  });
  return r.json();
}

async function qqDelete(env, path) {
  const tok = await getAccessToken(env);
  const r = await fetch('https://api.bot.qq.com' + path, {
    method: 'DELETE',
    headers: { Authorization: 'QQBot ' + tok }
  });
  try {
    return await r.json();
  } catch (e) {
    return { http: r.status };
  }
}

function keyboard(searchUrl) {
  return {
    content: {
      rows: [{
        buttons: [{
          id: 'btn_search',
          render_data: { label: '去搜索站', style: 1 },
          action: { type: 0, permission: { type: 2 }, data: searchUrl }
        }]
      }]
    }
  };
}

// 群消息可能触发 40054010（不允许发送 URL）→ 去掉 URL 重发，链接改走键盘按钮
async function sendGroup(env, groupOpenid, msgId, text, searchUrl) {
  const base = { msg_type: 0, msg_id: msgId, msg_seq: 1 };
  let res = await qqPost(env, '/v2/groups/' + groupOpenid + '/messages', { ...base, content: text });
  if (res && res.err_code === 40054010) {
    const noUrl = text.replace(/https?:\/\/\S+/g, '').replace(/\n{2,}/g, '\n').trim();
    res = await qqPost(env, '/v2/groups/' + groupOpenid + '/messages', { ...base, content: noUrl, keyboard: keyboard(searchUrl) });
  }
  return res;
}

async function sendC2C(env, userOpenid, msgId, text, searchUrl) {
  const base = { msg_type: 0, msg_id: msgId, msg_seq: 1 };
  let res = await qqPost(env, '/v2/users/' + userOpenid + '/messages', { ...base, content: text });
  if (res && res.err_code === 40054010) {
    const noUrl = text.replace(/https?:\/\/\S+/g, '').replace(/\n{2,}/g, '\n').trim();
    res = await qqPost(env, '/v2/users/' + userOpenid + '/messages', { ...base, content: noUrl, keyboard: keyboard(searchUrl) });
  }
  return res;
}

async function searchResources(env, q) {
  const rs = await env.RESOURCES_DB.prepare(
    "SELECT title, link FROM resources WHERE status = 'approved' AND (title LIKE ? OR keywords LIKE ?) ORDER BY view_count DESC, created_at DESC LIMIT 3"
  ).bind('%' + q + '%', '%' + q + '%').all();
  return rs.results || [];
}

// 发送失败时抓真实出口 IP（须用非 CF 托管的回显服务，否则抓到 CF 内部地址；QQ API 是纯 IPv4）
async function myEgressIp() {
  let v4 = '?';
  let v6 = '?';
  try {
    v4 = (await (await fetch('https://v4.ident.me', { cache: 'no-store' })).text()).trim().slice(0, 45);
  } catch (e) {
    v4 = 'fail';
  }
  try {
    v6 = (await (await fetch('https://v6.ident.me', { cache: 'no-store' })).text()).trim().slice(0, 45);
  } catch (e) {
    v6 = 'fail';
  }
  return 'v4=' + v4 + ' v6=' + v6;
}

function sendNote(res) {
  if (!res) return 'send=null';
  const code = res.err_code !== undefined ? res.err_code : 'ok';
  const msg = res.message || res.msg || '';
  return 'send=' + String(code).slice(0, 40) + (msg ? ' m=' + String(msg).slice(0, 60) : '');
}

function buildReply(q, list) {
  const searchUrl = 'https://www.weiyingjun.top/search/?q=' + encodeURIComponent(q) + '&ch=qq-group';
  if (list.length === 0) {
    return { text: '没有找到「' + q + '」相关资源。\n本群就是求资源群——直接发你要的资源名，看到会补；也可以稍后再 @我 搜一次，或去搜索站：\n' + searchUrl, searchUrl };
  }
  const lines = list.map((r, i) => (i + 1) + '. ' + r.title + '\n' + r.link);
  return { text: '找到 ' + list.length + ' 个「' + q + '」相关资源：\n' + lines.join('\n') + '\n完整列表：' + searchUrl, searchUrl };
}

// ---- 广告检测（保守词表，宁漏勿误杀；机器人自己回复含站点域名直接豁免）----
const AD_WORDS = [
  '加微信', '加薇', '加v信', '薇信', 'vx号', 'vx加',
  '兼职', '刷单', '日赚', '躺赚', '网赚', '代开发票', '招代理', '一手货源',
  '推广返利', '低价代', '资源群免费进'
];
const AD_REGEXES = [
  /(?:vx?|wx|weixin)[\s:：]*[a-zA-Z0-9_-]{6,}/i,
  /微(?:信|信号)[\s:：]*[a-zA-Z0-9_-]{6,}/,
  /https?:\/\/(?:t\.cn|dwz\.[a-z]+|url\.cn|sina\.cn|qq\.com\/[a-z])\//i
];

function adHit(text) {
  const t = text.toLowerCase();
  for (const w of AD_WORDS) {
    if (t.includes(w.toLowerCase())) return w;
  }
  for (const re of AD_REGEXES) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

function msgText(d) {
  const c = d.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map(x => (x && x.text) || '').join('');
  return '';
}

async function handleAd(env, d, from, raw) {
  const content = msgText(d).trim();
  const note0 = 'id=' + (d.id || '').slice(0, 40);
  if (!content || !from || !d.group_openid) return;

  // 豁免：机器人自己的回复（都带站点域名）及我们自己的固定文案
  if (content.includes('weiyingjun.top') || content.includes('求资源群')) return;

  const hit = adHit(content);
  if (!hit) return; // 未命中不写日志，避免全量消息写放大

  const gid = d.group_openid;
  let count = 0;
  let lastMsg = '';
  try {
    const row = await env.RESOURCES_DB.prepare(
      'SELECT count, last_msg FROM qq_ad_warns WHERE group_openid = ? AND member_openid = ?'
    ).bind(gid, from).first();
    // 同一条消息可能被重复推送（@事件与全量事件重叠），防双计
    if (row && row.last_msg && row.last_msg === d.id) {
      await logEvent(env, 'ad', { sigOk: 1, event: 'GROUP_MESSAGE_CREATE', fromUser: from, body: content, note: 'dup skip ' + note0 });
      return;
    }
    count = ((row && row.count) || 0) + 1;
    await env.RESOURCES_DB.prepare(
      'INSERT INTO qq_ad_warns (group_openid, member_openid, count, last_msg, updated_at) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(group_openid, member_openid) DO UPDATE SET count = ?, last_msg = ?, updated_at = ?'
    ).bind(gid, from, count, d.id, new Date().toISOString(), count, d.id, new Date().toISOString()).run();
  } catch (e) {
    await logEvent(env, 'ad', { sigOk: 1, event: 'GROUP_MESSAGE_CREATE', fromUser: from, body: content, note: 'warn upsert fail: ' + (e && e.message) });
    return;
  }

  const parts = ['hit=' + String(hit).slice(0, 30), 'warn=' + count];

  // 撤回广告消息（需机器人是群管理员）
  try {
    const res = await qqDelete(env, '/v2/groups/' + gid + '/messages/' + d.id);
    parts.push('recall ' + sendNote(res));
  } catch (e) {
    parts.push('recallErr=' + (e && e.message));
  }

  if (count >= 5) {
    // 踢人+拉黑：接口内邀中/无白名单(11253)时降级为禁言24小时，接口开放后自动恢复
    let kicked = false;
    try {
      const res = await qqPost(env, '/v2/groups/' + gid + '/batch_remove_members', {
        member_openids: [from],
        add_to_member_blacklist: true
      });
      kicked = !!(res && res.remove_members_result === 'success');
      parts.push('kick ' + (kicked ? 'ok' : sendNote(res)));
    } catch (e) {
      parts.push('kickErr=' + (e && e.message));
    }
    if (!kicked) {
      try {
        const res = await qqPost(env, '/v2/groups/' + gid + '/restrict_chat_setting', {
          members: [{ op: 'add', member_openid: from, mute_expire_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString() }]
        });
        parts.push('mute24 ' + sendNote(res));
      } catch (e) {
        parts.push('mute24Err=' + (e && e.message));
      }
    }
  } else if (count >= 3) {
    // 禁言10分钟（需机器人是群管理员）
    try {
      const res = await qqPost(env, '/v2/groups/' + gid + '/restrict_chat_setting', {
        members: [{ op: 'add', member_openid: from, mute_expire_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }]
      });
      parts.push('mute ' + sendNote(res));
    } catch (e) {
      parts.push('muteErr=' + (e && e.message));
    }
  }

  parts.push(note0);
  await logEvent(env, 'ad', { sigOk: 1, event: 'GROUP_MESSAGE_CREATE', fromUser: from, body: content.slice(0, 400), note: parts.join(' ') });
}

async function dispatch(env, payload, raw) {
  const d = payload.d || {};
  const event = typeof payload.t === 'string' ? payload.t : '';
  const outerId = payload.id || '';
  const author = d.author || {};
  const from = author.member_openid || author.user_openid || author.id || '';

  // 全量群消息：仅广告检测，不回复搜索（否则每句闲聊都会触发回复）
  if (event === 'GROUP_MESSAGE_CREATE') {
    await logEvent(env, 'gmc', { sigOk: 1, event, fromUser: from, body: raw, note: 'gmc peek id=' + String(d.id || '').slice(0, 40) });
    await handleAd(env, d, from, raw);
    return;
  }

  if (event === 'GROUP_AT_MESSAGE_CREATE' || event === 'C2C_MESSAGE_CREATE') {
    const content = (d.content || '').trim();
    const note0 = 'id=' + (d.id || '').slice(0, 40);
    if (!content) {
      await logEvent(env, 'msg', { sigOk: 1, event, fromUser: from, body: raw, note: 'empty content ' + note0 });
      return;
    }
    const q = content.replace(/[<>[\]]/g, '').slice(0, 24).trim();
    if (!q) {
      await logEvent(env, 'msg', { sigOk: 1, event, fromUser: from, body: raw, note: 'empty q ' + note0 });
      return;
    }
    if (!env.RESOURCES_DB) {
      await logEvent(env, 'msg', { sigOk: 1, event, fromUser: from, body: raw, note: 'no db binding ' + note0 });
      return;
    }
    try {
      const list = await searchResources(env, q);
      const { text, searchUrl } = buildReply(q, list);
      let res;
      if (event === 'C2C_MESSAGE_CREATE') {
        const uid = author.user_openid || author.id;
        res = await sendC2C(env, uid, d.id, text, searchUrl);
      } else {
        res = await sendGroup(env, d.group_openid, d.id, text, searchUrl);
      }
      let note = 'q=' + q + ' hits=' + list.length + ' ' + sendNote(res) + ' ' + note0;
      if (res && res.err_code) {
        note += ' egress=' + await myEgressIp();
      }
      await logEvent(env, 'msg', { sigOk: 1, event, fromUser: from, body: raw, note });
    } catch (e) {
      await logEvent(env, 'msg', { sigOk: 1, event, fromUser: from, body: raw, note: 'error: ' + (e && e.message) + ' ' + note0 });
    }
    return;
  }

  if (event === 'GROUP_ADD_ROBOT') {
    const gid = d.group_openid || '';
    let note = 'group=' + gid.slice(0, 40);
    const welcome =
      '欢迎进群！我是资源小助手。\n\n' +
      '回复资源关键词（如：考研英语、教资、手抄报）即可获取网盘链接；\n' +
      '也可以 @我 + 关键词 直接搜索。\n' +
      '全站资源搜索：https://www.weiyingjun.top/search/?ch=qq-group';
    if (gid && outerId) {
      try {
        const res = await qqPost(env, '/v2/groups/' + gid + '/messages', { msg_type: 0, content: welcome, event_id: outerId });
        note += ' ' + sendNote(res);
        if (res && res.err_code) note += ' egress=' + await myEgressIp();
      } catch (e) {
        note += ' sendErr=' + (e && e.message);
      }
    } else {
      note += ' skip (no gid/event id)';
    }
    await logEvent(env, 'event', { sigOk: 1, event, fromUser: from, body: raw, note });
    return;
  }

  await logEvent(env, 'event', { sigOk: 1, event, fromUser: from, body: raw, note: 'unhandled' });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const raw = await request.text();

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  if (!env.QQ_BOT_SECRET) {
    await logEvent(env, 'post', { sigOk: 0, event: String(payload.t || payload.op || ''), body: raw, note: 'QQ_BOT_SECRET not configured' });
    return new Response('qq secrets not configured', { status: 500 });
  }

  // op:13 回调地址验证：无签名头，直接用 Bot Secret 派生密钥签名 event_ts+plain_token
  if (payload.op === 13) {
    const plain = (payload.d && payload.d.plain_token) || '';
    const ts = String((payload.d && payload.d.event_ts) || '');
    let signature;
    try {
      signature = await edSign(env.QQ_BOT_SECRET, enc.encode(ts + plain));
    } catch (e) {
      await logEvent(env, 'op13', { sigOk: 0, body: raw, note: 'sign fail: ' + (e && e.message) });
      return new Response('sign fail', { status: 500 });
    }
    await logEvent(env, 'op13', { sigOk: 1, body: raw, note: 'validation ok' });
    return Response.json({ plain_token: plain, signature });
  }

  // 事件推送：Ed25519 验签（timestamp + body）
  const ts = request.headers.get('X-Signature-Timestamp') || '';
  const sig = request.headers.get('X-Signature-Ed25519') || '';
  const event = typeof payload.t === 'string' ? payload.t : 'op' + payload.op;
  const author = (payload.d && payload.d.author) || {};
  const from = author.member_openid || author.user_openid || author.id || '';

  const sigOk = await edVerify(env.QQ_BOT_SECRET, sig, enc.encode(ts + raw));
  if (!sigOk) {
    await logEvent(env, 'post', { sigOk: 0, event, fromUser: from, body: raw, note: 'bad signature' });
    return new Response('bad signature', { status: 401 });
  }

  context.waitUntil(dispatch(env, payload, raw));
  return Response.json({ d: {}, op: 12 });
}
