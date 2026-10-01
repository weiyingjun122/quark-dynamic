// functions/api/wechat/callback.js
// 公众号开发者模式回调
// GET  - 服务器配置校验（签名校验 + echostr 原样返回）
// POST - 关键词自动回复：查 D1 resources，命中回图文卡片（可点击），未命中引导去搜索站

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

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

function replyNews(to, from, items) {
  let articles = '';
  for (const it of items) {
    articles += '<item>' +
      '<Title><![CDATA[' + it.title + ']]></Title>' +
      (it.description ? '<Description><![CDATA[' + it.description + ']]></Description>' : '') +
      '<Url><![CDATA[' + it.url + ']]></Url>' +
      '</item>';
  }
  const xml = '<xml>' +
    '<ToUserName><![CDATA[' + to + ']]></ToUserName>' +
    '<FromUserName><![CDATA[' + from + ']]></FromUserName>' +
    '<CreateTime>' + Math.floor(Date.now() / 1000) + '</CreateTime>' +
    '<MsgType><![CDATA[news]]></MsgType>' +
    '<ArticleCount>' + items.length + '</ArticleCount>' +
    '<Articles>' + articles + '</Articles>' +
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
  if (!ok) return new Response('fail', { status: 403 });
  return new Response(url.searchParams.get('echostr') || '', { status: 200 });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const ok = await checkSignature(env, url);
  if (!ok) return new Response('fail', { status: 403 });

  const xml = await request.text();
  const msgType = getXmlTag(xml, 'MsgType');
  const from = getXmlTag(xml, 'FromUserName');
  const to = getXmlTag(xml, 'ToUserName');
  const content = (getXmlTag(xml, 'Content') || '').trim();

  // 关注事件：欢迎语
  if (msgType === 'event') {
    const event = getXmlTag(xml, 'Event');
    if (event === 'subscribe') {
      return replyText(to, from,
        '欢迎关注实用资源整理站！\n\n' +
        '回复资源名称（如：考研英语、剧本杀、红宝书）即可获取网盘链接；\n' +
        '也可以点击公众号菜单栏【找资源】进入搜索站，全站资源自由检索。');
    }
    return replyEmpty(); // 其他事件不回复
  }

  if (msgType !== 'text' || !content) {
    return replyEmpty();
  }

  if (!env.RESOURCES_DB) {
    return replyText(to, from, '系统繁忙，请稍后再试');
  }

  const q = content.replace(/[<>[\]]/g, '').slice(0, 24);
  if (!q) return replyEmpty();

  const searchUrl = 'https://www.weiyingjun.top/search/?q=' + encodeURIComponent(q) + '&ch=wechat-kw';

  try {
    const rs = await env.RESOURCES_DB.prepare(
      "SELECT title, link, type FROM resources WHERE status = 'approved' AND (title LIKE ? OR keywords LIKE ?) ORDER BY view_count DESC, created_at DESC LIMIT 4"
    ).bind('%' + q + '%', '%' + q + '%').all();
    const list = rs.results || [];

    const items = [];
    for (const r of list.slice(0, 3)) {
      items.push({ title: r.title, description: r.type || '资源', url: r.link });
    }
    items.push({
      title: list.length > 3 ? '更多结果 → 资源搜索站' : '🔍 全站搜索 · 实用资源整理站',
      description: '输入关键词检索全部资源',
      url: searchUrl
    });

    return replyNews(to, from, items);
  } catch (err) {
    return replyText(to, from, '查询失败，请稍后再试');
  }
}
