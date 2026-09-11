// functions/api/auth/register.js
// 用户注册

async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
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

  const { username, email, password, nickname } = body;

  if (!username || !email || !password) {
    return Response.json({ success: false, error: '请填写所有必填项' });
  }

  if (username.length < 3 || username.length > 20) {
    return Response.json({ success: false, error: '用户名需3-20个字符' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return Response.json({ success: false, error: '用户名只能包含字母、数字和下划线' });
  }

  if (password.length < 6) {
    return Response.json({ success: false, error: '密码至少6个字符' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ success: false, error: '邮箱格式不正确' });
  }

  try {
    const existing = await env.RESOURCES_DB.prepare(
      "SELECT id FROM users WHERE username = ? OR email = ?"
    ).bind(username, email).first();

    if (existing) {
      return Response.json({ success: false, error: '用户名或邮箱已被注册' });
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);
    const finalHash = salt + ':' + passwordHash;

    await env.RESOURCES_DB.prepare(
      "INSERT INTO users (username, email, password_hash, nickname) VALUES (?, ?, ?, ?)"
    ).bind(username, email, finalHash, nickname || username).run();

    return Response.json({ success: true, message: '注册成功' });

  } catch (err) {
    return Response.json({ success: false, error: '注册失败: ' + err.message });
  }
}
