// functions/api/resources/submit.js
// POST /api/resources/submit - 用户提交资源

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
    if (res.status >= 400) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { ok: false, reason: '链接响应超时' };
    }
    return { ok: false, reason: '链接无法访问' };
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const { title, link, type, email, skipCheck } = body;

  if (!title || !link) {
    return Response.json({ success: false, error: '请填写资源名称和链接' }, { status: 400 });
  }

  if (title.length > 200) {
    return Response.json({ success: false, error: '标题过长，最多200字' }, { status: 400 });
  }

  try {
    new URL(link);
  } catch {
    return Response.json({ success: false, error: '链接格式不正确' }, { status: 400 });
  }

  // 检查链接有效性
  if (!skipCheck) {
    const linkCheck = await checkLink(link);
    if (!linkCheck.ok) {
      return Response.json({
        success: false,
        error: `链接无效：${linkCheck.reason}，请检查链接是否正确`,
        linkValid: false
      }, { status: 400 });
    }
  }

  const blockedWords = ['赌博', '色情', '暴力', '枪支', '毒品', '诈骗', '洗钱'];
  const lowerTitle = title.toLowerCase();
  if (blockedWords.some(w => lowerTitle.includes(w))) {
    return Response.json({ success: false, error: '提交的内容包含违规信息' }, { status: 400 });
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const submittedBy = `ip:${ip}`;

  try {
    const existing = await env.RESOURCES_DB.prepare(
      "SELECT id FROM resources WHERE link = ? AND created_at > datetime('now', '-1 day')"
    ).bind(link).first();

    if (existing) {
      return Response.json({ success: false, error: '该链接已有人提交过，请勿重复提交' }, { status: 400 });
    }

    const result = await env.RESOURCES_DB.prepare(
      "INSERT INTO resources (title, link, type, source, status, submitted_by, email) VALUES (?, ?, ?, 'user', 'pending', ?, ?)"
    ).bind(title, link, type || '其他', submittedBy, email || '').run();

    return Response.json({
      success: true,
      message: '提交成功！我们会尽快审核您的资源。',
      id: result.meta?.last_row_id
    });

  } catch (err) {
    return Response.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
