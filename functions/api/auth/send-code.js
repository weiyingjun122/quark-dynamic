// functions/api/auth/send-code.js
// POST /api/auth/send-code {email} - 发送注册验证码（Resend 代发）
const COOLDOWN_SECONDS = 60;
const DAILY_LIMIT_EMAIL = 5;
const DAILY_LIMIT_IP = 10;
const CODE_TTL_SECONDS = 600; // 10分钟

function json(data, status) {
  return Response.json(data, { status: status || 200 });
}

function generateCode() {
  const buf = new Uint8Array(3);
  crypto.getRandomValues(buf);
  const n = (buf[0] << 16) | (buf[1] << 8) | buf[2];
  return String(n % 1000000).padStart(6, '0');
}

function buildMail(code) {
  const text = [
    '你好，你正在「实用资源整理站」注册账号。',
    '',
    '注册验证码：' + code,
    '有效期 10 分钟，请勿泄露给他人。',
    '',
    '若非本人操作，请忽略本邮件。',
    '实用资源整理站 https://www.weiyingjun.top'
  ].join('\n');

  const html = '<div style="font-family:-apple-system,\'Microsoft YaHei\',sans-serif;max-width:460px;margin:0 auto;padding:24px;color:#333">' +
    '<h2 style="color:#2563eb;margin:0 0 16px">注册验证码</h2>' +
    '<p style="font-size:14px;line-height:1.7">你好，你正在 <b>实用资源整理站</b> 注册账号，验证码是：</p>' +
    '<div style="font-size:32px;letter-spacing:10px;font-weight:bold;color:#2563eb;background:#eff6ff;border:1px dashed #93c5fd;border-radius:8px;padding:14px;text-align:center;margin:16px 0">' + code + '</div>' +
    '<p style="font-size:13px;color:#666;line-height:1.7">验证码 <b>10 分钟</b> 内有效，请勿泄露给他人。若非本人操作，请忽略本邮件。</p>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:18px 0">' +
    '<p style="font-size:12px;color:#94a3b8;margin:0">实用资源整理站 · <a href="https://www.weiyingjun.top" style="color:#2563eb">www.weiyingjun.top</a></p>' +
    '</div>';

  return { text, html };
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return json({ success: false, error: '数据库未配置' }, 500);
  }
  if (!env.RESEND_API_KEY) {
    return json({ success: false, error: '邮件服务未配置' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: '请求格式错误' }, 400);
  }

  const email = (body.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: '邮箱格式不正确' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const now = Math.floor(Date.now() / 1000);

  try {
    // 60秒冷却
    const last = await env.RESOURCES_DB.prepare(
      "SELECT strftime('%s', created_at) AS ts FROM email_codes WHERE email = ? ORDER BY id DESC LIMIT 1"
    ).bind(email).first();
    if (last && last.ts && now - Number(last.ts) < COOLDOWN_SECONDS) {
      return json({ success: false, error: '发送太频繁，请' + (COOLDOWN_SECONDS - (now - Number(last.ts))) + '秒后再试' }, 429);
    }

    // 每邮箱每天5封（北京时间）
    const emailCount = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) AS c FROM email_codes WHERE email = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')"
    ).bind(email).first();
    if ((emailCount?.c || 0) >= DAILY_LIMIT_EMAIL) {
      return json({ success: false, error: '该邮箱今日发送次数已达上限' }, 429);
    }

    // 每IP每天10封
    const ipCount = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) AS c FROM email_codes WHERE ip = ? AND date(created_at, '+8 hours') = date('now', '+8 hours')"
    ).bind(ip).first();
    if ((ipCount?.c || 0) >= DAILY_LIMIT_IP) {
      return json({ success: false, error: '今日发送次数已达上限，请明天再试' }, 429);
    }

    // 作废该邮箱所有未使用的旧码，只保留最新一条
    await env.RESOURCES_DB.prepare(
      'UPDATE email_codes SET used = 1 WHERE email = ? AND used = 0'
    ).bind(email).run();

    const code = generateCode();
    const expiresAt = now + CODE_TTL_SECONDS;
    await env.RESOURCES_DB.prepare(
      'INSERT INTO email_codes (email, code, purpose, expires_at, ip) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, code, 'register', expiresAt, ip).run();

    const mail = buildMail(code);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: '实用资源整理站 <no-reply@weiyingjun.top>',
        reply_to: 'weiyingjun122@gmail.com',
        to: [email],
        subject: '【实用资源整理站】注册验证码 ' + code,
        text: mail.text,
        html: mail.html
      })
    });

    if (!res.ok) {
      // 发送失败则删掉刚插入的验证码，避免占用冷却时间
      const detail = await res.text().catch(() => '');
      console.log('resend failed:', res.status, detail);
      await env.RESOURCES_DB.prepare(
        'DELETE FROM email_codes WHERE email = ? AND code = ? AND used = 0'
      ).bind(email, code).run();
      return json({ success: false, error: '邮件发送失败，请稍后再试' }, 502);
    }

    return json({ success: true, message: '验证码已发送，请查收邮箱（10分钟内有效）', cooldown: COOLDOWN_SECONDS });
  } catch (err) {
    return json({ success: false, error: '发送失败: ' + err.message }, 500);
  }
}
