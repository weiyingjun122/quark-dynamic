// functions/api/resources/submit-batch.js
// POST /api/resources/submit-batch - 批量提交资源

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
      return { ok: false, reason: '响应超时' };
    }
    return { ok: false, reason: '无法访问' };
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

  const { items, email, skipCheck } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return Response.json({ success: false, error: '请提供要提交的资源列表' }, { status: 400 });
  }

  if (items.length > 50) {
    return Response.json({ success: false, error: '单次最多提交50条' }, { status: 400 });
  }

  const blockedWords = ['赌博', '色情', '暴力', '枪支', '毒品', '诈骗', '洗钱'];
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const submittedBy = `ip:${ip}`;

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

    try {
      new URL(link);
    } catch {
      results.push({ title, success: false, error: '链接格式不正确' });
      continue;
    }

    // 检查链接有效性
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
        "INSERT INTO resources (title, link, type, source, status, submitted_by, email) VALUES (?, ?, ?, 'user', 'pending', ?, ?)"
      ).bind(title, link, type || '其他', submittedBy, email || '').run();

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
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
