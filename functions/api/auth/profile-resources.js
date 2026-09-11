// functions/api/auth/profile-resources.js
// 获取当前用户提交的资源列表

async function verifyToken(env, request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const secret = env.JWT_SECRET || 'wyj-resource-site-secret-2026';
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(headerB64 + '.' + payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(atob(payloadB64));
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
  const limit = 100;
  const offset = (page - 1) * limit;

  try {
    const results = await env.RESOURCES_DB.prepare(
      "SELECT id, title, link, type, status, created_at FROM resources WHERE submitted_by = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(user.username, limit, offset).all();

    return Response.json({
      success: true,
      results: results.results || []
    });
  } catch (err) {
    return Response.json({ success: false, error: '查询失败' });
  }
}
