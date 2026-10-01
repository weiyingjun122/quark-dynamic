// functions/api/wechat/callback.js
// 公众号开发者模式回调
// GET  - 服务器配置校验（签名校验 + echostr 原样返回）
// POST - 关键词自动回复：查 D1 resources，命中回图文卡片（可点击），未命中引导去搜索站
// 所有请求落 D1 表 wechat_logs，用于排查微信推送是否到达

function sha1Hex(str) {
  const buf = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-1', buf).then(d =>
    Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('')
  );
}

function checkSignature(env, url) {
  const token = env.WECHAT_TOKEN;
  if (!token) return Promise.resolve(false);
  const signature = url.searchParams.get('signature') || '';
  const timestamp = url.searchParams.get('timestamp') || '';
  const nonce = url.searchParams.get('nonce') || '';
  const arr = [token, timestamp, nonce].sort().join('');
  return sha1Hex(arr).then(h => h === signature);
}

function getXmlTag(xml, tag) {
  let m = xml.match(new RegExp('<' + tag + '><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></' + tag + '>'));
  if (!m) m = xml.match(new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1] : '';
}

async function logEvent(env, kind, f) {
  try {
    console.log(JSON.stringify({ kind, sigOk: f.sigOk, msgType: f.msgType, from: f.fromUser, note: f.note, body: (f.body || '').slice(0, 300) }));
    if (env.RESOURCES_DB) {
      await env.RESOURCES_DB.prepare(
        'INSERT INTO wechat_logs (kind, sig_ok, msg_type, from_user, body, note) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        kind,
        f.sigOk ? 1 : 0,
        (f.msgType || '').slice(0, 20),
        (f.fromUser || '').slice(0, 64),
        (f.body || '').slice(0, 800),
        (f.note || '').slice(0, 300)
      ).run();
    }
  } catch (e) {
    console.log('logEvent failed: ' + (e && e.message));
  }
}

function replyText(to, from, content) {
  const xml = '<xml>' +
    '<ToUserName><![CDATA[' + to + ']]></ToUserName>' +
    '<FromUserName><![CDATA[' + from + ']]></FromUserName>' +
    '<CreateTime>' + Math.floor(Date.now() / 1000) + '</CreateTime>' +
    '<MsgType><![CDATA[text]]></MsgType>' +
    '<Content><![CDATA[' + content + ']]></Content>' +
    '</xml>';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

function replyNews(to, from, item) {
  const xml = '<xml>' +
    '<ToUserName><![CDATA[' + to + ']]></ToUserName>' +
    '<FromUserName><![CDATA[' + from + ']]></FromUserName>' +
    '<CreateTime>' + Math.floor(Date.now() / 1000) + '</CreateTime>' +
    '<MsgType><![CDATA[news]]></MsgType>' +
    '<ArticleCount>1</ArticleCount>' +
    '<Articles><item>' +
    '<Title><![CDATA[' + item.title + ']]></Title>' +
    '<Description><![CDATA[' + item.description + ']]></Description>' +
    '<PicUrl><![CDATA[' + item.picUrl + ']]></PicUrl>' +
    '<Url><![CDATA[' + item.url + ']]></Url>' +
    '</item></Articles>' +
    '</xml>';
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

function replyEmpty() {
  return new Response('', { status: 200 });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const ok = await checkSignature(env, url);
  await logEvent(env, 'get', { sigOk: ok, note: ok ? 'verify ok' : 'bad signature' });
  if (!ok) return new Response('fail', { status: 403 });
  return new Response(url.searchParams.get('echostr') || '', { status: 200 });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const ok = await checkSignature(env, url);

  const xml = await request.text();
  const msgType = getXmlTag(xml, 'MsgType');
  const from = getXmlTag(xml, 'FromUserName');

  if (!ok) {
    await logEvent(env, 'post', { sigOk: 0, msgType, fromUser: from, body: xml, note: 'bad signature' });
    return new Response('fail', { status: 403 });
  }

  const ghId = getXmlTag(xml, 'ToUserName');       // 公众号原始ID
  const userId = getXmlTag(xml, 'FromUserName');   // 用户openid
  const content = (getXmlTag(xml, 'Content') || '').trim();

  if (msgType === 'event') {
    const event = getXmlTag(xml, 'Event');
    if (event === 'subscribe') {
      await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'reply welcome' });
      return replyText(userId, ghId,
        '欢迎关注实用资源整理站！\n\n' +
        '回复资源名称（如：考研英语、剧本杀、红宝书）即可获取网盘链接；\n' +
        '也可以点击公众号菜单栏【找资源】进入搜索站，全站资源自由检索。');
    }
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'empty event=' + event });
    return replyEmpty();
  }

  if (msgType !== 'text' || !content) {
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'empty non-text' });
    return replyEmpty();
  }

  if (!env.RESOURCES_DB) {
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'no db binding' });
    return replyText(userId, ghId, '系统繁忙，请稍后再试');
  }

  const q = content.replace(/[<>[\]]/g, '').slice(0, 24);
  if (!q) {
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'empty q' });
    return replyEmpty();
  }

  const searchUrl = 'https://www.weiyingjun.top/search/?q=' + encodeURIComponent(q) + '&ch=wechat-kw';

  try {
    const rs = await env.RESOURCES_DB.prepare(
      "SELECT title, link, type FROM resources WHERE status = 'approved' AND (title LIKE ? OR keywords LIKE ?) ORDER BY view_count DESC, created_at DESC LIMIT 4"
    ).bind('%' + q + '%', '%' + q + '%').all();
    const list = rs.results || [];

    if (list.length === 0) {
      await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'reply text miss' });
      return replyText(userId, ghId, '没有找到「' + q + '」相关资源。去搜索站试试：' + searchUrl);
    }

    // 回复文本消息时微信只允许1条图文，且 PicUrl 必填
    const top = list[0];
    const more = list.slice(1).map(r => r.title).join('；');
    const desc = (more ? '更多：' + more + '｜' : '') + '完整列表 ' + searchUrl;
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'reply news=1 hits=' + list.length });
    return replyNews(userId, ghId, {
      title: top.title,
      description: desc.slice(0, 500),
      picUrl: 'https://www.weiyingjun.top/static/logo.png',
      url: top.link
    });
  } catch (err) {
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'query error: ' + (err && err.message) });
    return replyText(userId, ghId, '查询失败，请稍后再试');
  }
}
