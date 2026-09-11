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

  const userInfo = await env.RESOURCES_DB.prepare(
    "SELECT points, vip_level FROM users WHERE id = ?"
  ).bind(user.id).first();
  const userPoints = userInfo?.points || 0;
  const isVip = (userInfo?.vip_level || 0) > 0;
  const costPerItem = 2;
  const dailyLimit = isVip ? 999 : 5;
  const batchLimit = isVip ? 50 : 5;

  const todayLog = await env.RESOURCES_DB.prepare(
    "SELECT COUNT(*) as cnt FROM points_log WHERE user_id = ? AND change_type = 'submit' AND created_at > datetime('now', '-1 day')"
  ).bind(user.id).first();
  const todaySubmitCount = todayLog?.cnt || 0;

  let body;
  try { body = await request.json(); } catch {
    return Response.json({ success: false, error: '请求格式错误' }, { status: 400 });
  }

  const { items, skipCheck } = body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return Response.json({ success: false, error: '请提供要提交的资源列表' }, { status: 400 });
  }

  if (todaySubmitCount + items.length > dailyLimit) {
    return Response.json({ success: false, error: `今日提交已达上限（${dailyLimit}条），剩余${Math.max(0, dailyLimit - todaySubmitCount)}条` });
  }

  if (!isVip && userPoints < items.length * costPerItem) {
    return Response.json({ success: false, error: `积分不足，需要${items.length * costPerItem}积分，当前${userPoints}积分。每日签到可获取积分。` });
  }

  if (items.length > batchLimit) {
    return Response.json({ success: false, error: `单次最多提交${batchLimit}条` });
  }

  const blockedWords = [
    '赌博', '色情', '暴力', '枪支', '毒品', '诈骗', '洗钱',
    '成人', 'AV', 'av', '黄片', '黄色', 'Porn', 'porn', 'sex', 'Sex',
    '枪械', '弹药', '炸药', '管制刀具', '违禁品',
    '代开发票', '洗钱', '套现', '外挂', '私服',
    '传销', '非法集资', '高利贷', '裸贷',
    '代孕', '买卖人体器官', '贩卖人口',
    '翻墙', 'VPN', 'vpn', '科学上网',
    '私服', '外挂', '作弊',
    '盗版', '破解版', '注册机', 'KeyGen', 'keygen'
  ];
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

  let remainingPoints = userPoints;
  if (successCount > 0 && !isVip) {
    const totalCost = successCount * costPerItem;
    remainingPoints = userPoints - totalCost;
    await env.RESOURCES_DB.prepare(
      "UPDATE users SET points = ? WHERE id = ?"
    ).bind(remainingPoints, user.id).run();
    await env.RESOURCES_DB.prepare(
      "INSERT INTO points_log (user_id, change_amount, change_type, description) VALUES (?, ?, 'submit', ?)"
    ).bind(user.id, -totalCost, `提交${successCount}条资源 -${totalCost}积分`).run();
  }

  return Response.json({
    success: true,
    message: `提交完成：成功 ${successCount} 个，失败 ${failCount} 个`,
    results,
    successCount,
    failCount,
    pointsUsed: isVip ? 0 : successCount * costPerItem,
    remainingPoints
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
