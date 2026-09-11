// functions/api/auth/profile.js
// 用户信息：GET 获取，PUT 更新

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
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const user = await verifyToken(env, request);
  if (!user) return Response.json({ success: false, error: '未登录' }, { status: 401 });

  if (!env.RESOURCES_DB) return Response.json({ success: false, error: '数据库未配置' });

  try {
    const profile = await env.RESOURCES_DB.prepare(
      "SELECT id, username, email, nickname, avatar, bio, created_at, last_login FROM users WHERE id = ?"
    ).bind(user.id).first();

    if (!profile) return Response.json({ success: false, error: '用户不存在' }, { status: 404 });

    const submitCount = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) as total FROM resources WHERE submitted_by = ?"
    ).bind(user.username).first();

    const approvedCount = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) as total FROM resources WHERE submitted_by = ? AND status = 'approved'"
    ).bind(user.username).first();

    const pendingCount = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) as total FROM resources WHERE submitted_by = ? AND status = 'pending'"
    ).bind(user.username).first();

    return Response.json({
      success: true,
      user: profile,
      stats: {
        submitted: submitCount?.total || 0,
        approved: approvedCount?.total || 0,
        pending: pendingCount?.total || 0
      }
    });
  } catch (err) {
    return Response.json({ success: false, error: '获取失败' });
  }
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const user = await verifyToken(env, request);
  if (!user) return Response.json({ success: false, error: '未登录' }, { status: 401 });

  if (!env.RESOURCES_DB) return Response.json({ success: false, error: '数据库未配置' });

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ success: false, error: '请求格式错误' });
  }

  const { nickname, bio, old_password, new_password } = body;

  try {
    if (new_password) {
      if (!old_password) return Response.json({ success: false, error: '请输入原密码' });
      if (new_password.length < 6) return Response.json({ success: false, error: '新密码至少6个字符' });

      const userRecord = await env.RESOURCES_DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
      const [salt, storedHash] = userRecord.password_hash.split(':');
      const encoder = new TextEncoder();
      const data = encoder.encode(salt + old_password);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const inputHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      if (inputHash !== storedHash) return Response.json({ success: false, error: '原密码错误' });

      const newSalt = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      const newData = encoder.encode(newSalt + new_password);
      const newHashBuffer = await crypto.subtle.digest('SHA-256', newData);
      const newHash = Array.from(new Uint8Array(newHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      await env.RESOURCES_DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newSalt + ':' + newHash, user.id).run();
    }

    if (nickname !== undefined || bio !== undefined) {
      await env.RESOURCES_DB.prepare(
        "UPDATE users SET nickname = COALESCE(?, nickname), bio = COALESCE(?, bio) WHERE id = ?"
      ).bind(nickname || null, bio || null, user.id).run();
    }

    return Response.json({ success: true, message: '更新成功' });
  } catch (err) {
    return Response.json({ success: false, error: '更新失败' });
  }
}
