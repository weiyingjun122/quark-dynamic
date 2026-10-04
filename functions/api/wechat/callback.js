// functions/api/wechat/callback.js
// 公众号开发者模式回调
// GET  - 服务器配置校验（签名校验 + echostr 原样返回）
// POST - 关键词自动回复：查 D1 resources，命中回图文卡片（可点击），未命中引导去搜索站
// 所有请求+回复内容落 D1 表 wechat_logs，查询用 GET /api/wechat/logs

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
  const reply = (f.reply || '').slice(0, 800);
  try {
    console.log(JSON.stringify({ kind, sigOk: f.sigOk, msgType: f.msgType, from: f.fromUser, note: f.note, reply, body: (f.body || '').slice(0, 300) }));
    if (env.RESOURCES_DB) {
      try {
        await env.RESOURCES_DB.prepare(
          'INSERT INTO wechat_logs (kind, sig_ok, msg_type, from_user, body, note, reply) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(
          kind,
          f.sigOk ? 1 : 0,
          (f.msgType || '').slice(0, 20),
          (f.fromUser || '').slice(0, 64),
          (f.body || '').slice(0, 800),
          (f.note || '').slice(0, 300),
          reply
        ).run();
      } catch (colErr) {
        // 旧表没有 reply 列时退回旧插入，迁移语句见 schema-logs.sql
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
      const welcome = '欢迎关注实用资源整理站！\n\n' +
        '回复资源名称（如：考研英语、教资、手抄报）即可获取网盘链接；\n' +
        '全站资源搜索：https://www.weiyingjun.top/search/?ch=wechat-welcome\n' +
        '（链接可复制到浏览器打开）';
      await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'reply welcome', reply: welcome });
      return replyText(userId, ghId, welcome);
    }
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'empty event=' + event });
    return replyEmpty();
  }

  if (msgType !== 'text' || !content) {
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'empty non-text' });
    return replyEmpty();
  }

  if (!env.RESOURCES_DB) {
    const busy = '系统繁忙，请稍后再试';
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'no db binding', reply: busy });
    return replyText(userId, ghId, busy);
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
      const miss = '没有找到「' + q + '」相关资源。\n去搜索站：' + searchUrl + '\n也可以加QQ求资源群 389630567，进群 @机器人 说资源名，帮你找！';
      await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'reply text miss', reply: miss });
      return replyText(userId, ghId, miss);
    }

    // 回复文本消息时微信只允许1条图文，且 PicUrl 必填
    const top = list[0];
    const more = list.slice(1).map(r => r.title).join('；');
    const desc = (more ? '更多：' + more + '｜' : '') + '完整列表 ' + searchUrl;
    await logEvent(env, 'post', {
      sigOk: 1, msgType, fromUser: userId, body: xml,
      note: 'reply news=1 hits=' + list.length,
      reply: '[图文卡片] ' + top.title + ' -> ' + top.link
    });
    return replyNews(userId, ghId, {
      title: top.title,
      description: desc.slice(0, 500),
      picUrl: 'https://www.weiyingjun.top/static/logo.png',
      url: top.link
    });
  } catch (err) {
    const fail = '查询失败，请稍后再试';
    await logEvent(env, 'post', { sigOk: 1, msgType, fromUser: userId, body: xml, note: 'query error: ' + (err && err.message), reply: fail });
    return replyText(userId, ghId, fail);
  }
}
