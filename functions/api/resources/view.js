// functions/api/resources/view.js
// POST /api/resources/view - 增加资源浏览次数（共享搜索次数限制）
export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求格式错误' });
  }

  const { id } = body;
  if (!id) {
    return Response.json({ success: false, error: '缺少资源ID' });
  }

  // 次数限制：未登录3次/天，登录5次/天
  const DAILY_LIMIT_UNLOGGED = 3;
  const DAILY_LIMIT_LOGGED = 5;
  const today = new Date().toISOString().split('T')[0];

  // 获取用户标识
  let identifier = '';
  let isLogged = false;
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, env.JWT_SECRET || 'wyj-resource-site-secret-2026');
    if (payload && payload.id) {
      identifier = 'user:' + payload.id;
      isLogged = true;
    }
  }
  if (!identifier) {
    identifier = 'ip:' + (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown');
  }

  const maxLimit = isLogged ? DAILY_LIMIT_LOGGED : DAILY_LIMIT_UNLOGGED;

  try {
    // 查询今日已用次数
    const used = await env.RESOURCES_DB.prepare(
      'SELECT search_count FROM search_limits WHERE identifier = ? AND date = ?'
    ).bind(identifier, today).first();

    const usedCount = used?.search_count || 0;

    if (usedCount >= maxLimit) {
      return Response.json({
        success: false,
        error: 'rate_limited',
        message: isLogged ? '今日使用次数已用完' : '未登录用户每日限用' + DAILY_LIMIT_UNLOGGED + '次，请登录获取更多次数',
        remaining: 0
      }, { status: 429 });
    }

    // 更新次数
    if (used) {
      await env.RESOURCES_DB.prepare(
        'UPDATE search_limits SET search_count = search_count + 1 WHERE identifier = ? AND date = ?'
      ).bind(identifier, today).run();
    } else {
      await env.RESOURCES_DB.prepare(
        'INSERT INTO search_limits (identifier, date, search_count) VALUES (?, ?, 1)'
      ).bind(identifier, today).run();
    }

    // 增加资源浏览次数
    await env.RESOURCES_DB.prepare(
      "UPDATE resources SET view_count = view_count + 1 WHERE id = ? AND status = 'approved'"
    ).bind(id).run();

    const remaining = maxLimit - usedCount - 1;

    return Response.json({ success: true, remaining, limit: maxLimit });

  } catch (err) {
    return Response.json({ success: false, error: '记录失败' });
  }
}

// JWT验证函数
async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0)),
      encoder.encode(parts[0] + '.' + parts[1])
    );
    return valid ? payload : null;
  } catch (e) {
    return null;
  }
}
