// functions/api/track/ch.js
// 搜索页 ch 曝光上报（beacon）：/api/track/ch?ch=渠道&p=路径
// 记 click_logs(kind=view)，用于统计落地页浏览（含未走中转的老链接，如已发布推文）

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const ch = (url.searchParams.get('ch') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  const p = (url.searchParams.get('p') || '').slice(0, 200);

  if (ch) {
    try {
      if (env.RESOURCES_DB) {
        await env.RESOURCES_DB.prepare(
          'INSERT INTO click_logs (kind, ch, target, ip, ua, referer) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          'view',
          ch,
          p,
          (request.headers.get('CF-Connecting-IP') || '').slice(0, 45),
          (request.headers.get('User-Agent') || '').slice(0, 200),
          (request.headers.get('Referer') || '').slice(0, 200)
        ).run();
      }
    } catch (e) {
      console.log('view log fail: ' + (e && e.message));
    }
  }

  return new Response(null, { status: 204 });
}
