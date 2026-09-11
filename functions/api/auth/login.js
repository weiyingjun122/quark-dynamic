// functions/api/auth/login.js
// 用户登录

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function generateToken(env, userId, username) {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ id: userId, username, exp: Date.now() + 7 * 24 * 3600 * 1000 }));
  const secret = env.JWT_SECRET || 'wyj-resource-site-secret-2026';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(header + '.' + payload));
  const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return header + '.' + payload + '.' + sig;
}

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

  const { login, password } = body;

  if (!login || !password) {
    return Response.json({ success: false, error: '请输入用户名/邮箱和密码' });
  }

  try {
    const user = await env.RESOURCES_DB.prepare(
      "SELECT id, username, email, password_hash, nickname, avatar, bio FROM users WHERE username = ? OR email = ?"
    ).bind(login, login).first();

    if (!user) {
      return Response.json({ success: false, error: '用户不存在' });
    }

    const parts = user.password_hash.split(':');
    if (parts.length !== 2) {
      return Response.json({ success: false, error: '账户数据异常' });
    }

    const [salt, storedHash] = parts;
    const inputHash = await hashPassword(password, salt);

    if (inputHash !== storedHash) {
      return Response.json({ success: false, error: '密码错误' });
    }

    await env.RESOURCES_DB.prepare(
      "UPDATE users SET last_login = datetime('now') WHERE id = ?"
    ).bind(user.id).run();

    const token = await generateToken(env, user.id, user.username);

    return Response.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        bio: user.bio
      }
    });

  } catch (err) {
    return Response.json({ success: false, error: '登录失败: ' + err.message });
  }
}
