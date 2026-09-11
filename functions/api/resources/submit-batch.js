// functions/api/resources/submit-batch.js
// POST /api/resources/submit-batch - 批量提交资源

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

async function checkLink(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkChecker/1.0)' }
    });
    clearTimeout(timeout);
    if (res.status >= 400) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true, status: res.status };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, reason: '响应超时' };
    return { ok: false, reason: '无法访问' };
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' }, { status: 500 });
  }

  const user = await verifyToken(env, request);
  if (!user) {
    return Response.json({ success: false, error: '请先登录' }, { status: 401 });
  }

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const { items, skipCheck } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return Response.json({ success: false, error: '请提供要提交的资源列表' }, { status: 400 });
  }

  if (items.length > 50) {
    return Response.json({ success: false, error: '单次最多提交50条' }, { status: 400 });
  }

  const blockedWords = ['赌博', '色情', '暴力', '枪支', '毒品', '诈骗', '洗钱'];
  const submittedBy = user.username;
  const results = [];

  for (const item of items) {
    const { title, link, type } = item;

    if (!title || !link) {
      results.push({ title: title || link || '?', success: false, error: '缺少名称或链接' });
      continue;
    }
    if (title.length > 200) {
      results.push({ title, success: false, error: '标题过长' });
      continue;
    }
    try { new URL(link); } catch {
      results.push({ title, success: false, error: '链接格式不正确' });
      continue;
    }

    if (!skipCheck) {
      const linkCheck = await checkLink(link);
      if (!linkCheck.ok) {
        results.push({ title, success: false, error: `链接无效: ${linkCheck.reason}` });
        continue;
      }
    }

    const lowerTitle = title.toLowerCase();
    if (blockedWords.some(w => lowerTitle.includes(w))) {
      results.push({ title, success: false, error: '包含违规信息' });
      continue;
    }

    try {
      const existing = await env.RESOURCES_DB.prepare(
        "SELECT id FROM resources WHERE link = ? AND created_at > datetime('now', '-1 day')"
      ).bind(link).first();
      if (existing) {
        results.push({ title, success: false, error: '24小时内已提交过' });
        continue;
      }

      await env.RESOURCES_DB.prepare(
        "INSERT INTO resources (title, link, type, source, status, submitted_by) VALUES (?, ?, ?, 'user', 'pending', ?)"
      ).bind(title, link, type || '其他', submittedBy).run();
      results.push({ title, success: true });
    } catch (err) {
      results.push({ title, success: false, error: '提交失败' });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return Response.json({
    success: true,
    message: `提交完成：成功 ${successCount} 个，失败 ${failCount} 个`,
    results,
    successCount,
    failCount
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}
