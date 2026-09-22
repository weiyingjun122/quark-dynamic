// functions/api/resources/limit.js
// GET /api/resources/limit - 查询当前剩余次数（不消耗）
export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  const DAILY_LIMIT_UNLOGGED = 3;
  const DAILY_LIMIT_LOGGED = 5;
  const today = new Date().toISOString().split('T')[0];

  let identifier = '';
  let isLogged = false;
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.id) {
          identifier = 'user:' + payload.id;
          isLogged = true;
        }
      }
    } catch (e) {}
  }
  if (!identifier) {
    identifier = 'ip:' + (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown');
  }

  const maxLimit = isLogged ? DAILY_LIMIT_LOGGED : DAILY_LIMIT_UNLOGGED;

  try {
    const used = await env.RESOURCES_DB.prepare(
      'SELECT search_count FROM search_limits WHERE identifier = ? AND date = ?'
    ).bind(identifier, today).first();

    const usedCount = used?.search_count || 0;
    const remaining = Math.max(0, maxLimit - usedCount);

    return Response.json({ success: true, remaining, limit: maxLimit });

  } catch (err) {
    return Response.json({ success: false, error: '查询失败' });
  }
}
