// functions/api/resources/go.js
// 渠道归因中转站：/api/resources/go?ch=渠道&u=<encodeURIComponent(目标URL)>
// 记 click_logs(kind=click) 后 302；目标域名白名单防开放重定向

const ALLOWED_HOSTS = ['www.weiyingjun.top', 'weiyingjun.top', 'pan.quark.cn'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ch = (url.searchParams.get('ch') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const raw = url.searchParams.get('u') || '';

  let target = 'https://www.weiyingjun.top/search/';
  try {
    const t = new URL(raw);
    if ((t.protocol === 'https:' || t.protocol === 'http:') && ALLOWED_HOSTS.includes(t.hostname)) {
      target = t.toString();
    }
  } catch (e) {
    // 非法/缺失 → 搜索首页
  }

  try {
    if (env.RESOURCES_DB) {
      await env.RESOURCES_DB.prepare(
        'INSERT INTO click_logs (kind, ch, target, ip, ua, referer) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(
        'click',
        ch,
        target.slice(0, 300),
        (request.headers.get('CF-Connecting-IP') || '').slice(0, 45),
        (request.headers.get('User-Agent') || '').slice(0, 200),
        (request.headers.get('Referer') || '').slice(0, 200)
      ).run();
    }
  } catch (e) {
    console.log('click log fail: ' + (e && e.message));
  }

  return Response.redirect(target, 302);
}
