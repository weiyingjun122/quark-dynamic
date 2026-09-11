// functions/api/auth/points.js
// GET /api/auth/points - 积分流水记录

async function verifyToken(env, request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const secret = env.JWT_SECRET || 'wyj-resource-site-secret-2026';
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = s.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(h + '.' + p));
    if (!valid) return null;
    const payload = JSON.parse(atob(p));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const user = await verifyToken(env, request);
  if (!user) return Response.json({ success: false, error: '未登录' }, { status: 401 });

  if (!env.RESOURCES_DB) return Response.json({ success: false, error: '数据库未配置' });

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const userInfo = await env.RESOURCES_DB.prepare(
      "SELECT points, vip_level, consecutive_days, last_checkin FROM users WHERE id = ?"
    ).bind(user.id).first();

    const results = await env.RESOURCES_DB.prepare(
      "SELECT change_amount, change_type, description, created_at FROM points_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(user.id, limit, offset).all();

    const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
    const checkedInToday = userInfo.last_checkin === today;

    return Response.json({
      success: true,
      points: userInfo.points || 0,
      vipLevel: userInfo.vip_level || 0,
      consecutiveDays: userInfo.consecutive_days || 0,
      checkedInToday,
      history: results.results || []
    });
  } catch (err) {
    return Response.json({ success: false, error: '查询失败' });
  }
}
