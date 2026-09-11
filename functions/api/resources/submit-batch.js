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
    // 色情
    '色情', '成人', 'AV', 'av', '黄片', '黄色', 'Porn', 'porn', 'sex', 'Sex',
    '裸聊', '约炮', '一夜情', '卖淫', '嫖娼', '性爱', '做爱', '口交', '肛交',
    '淫秽', '淫荡', '骚逼', '鸡巴', '阴茎', '阴道', '乳房', '高潮',
    '诱惑', '熟女', '萝莉', '幼女', 'SM', 'sm', '调教', '捆绑',
    '写真', '套图', '福利姬', '软色情', '擦边',
    // 赌博
    '赌博', '赌球', '赌马', '赌场', '博彩', '彩票', '外围', '赌局',
    '网赌', '线上赌场', '老虎机', '百家乐', '德州扑克',
    // 毒品
    '毒品', '冰毒', '大麻', '海洛因', '摇头丸', 'K粉', '可卡因',
    '吸毒', '贩毒', '制毒', '毒贩', '瘾君子',
    // 武器暴力
    '枪支', '枪械', '弹药', '炸药', '管制刀具', '违禁品',
    '爆炸物', '雷管', '子弹', '手枪', '步枪', '冲锋枪',
    '暴力', '血腥', '砍杀', '虐杀', '酷刑', '恐怖主义',
    // 诈骗犯罪
    '诈骗', '洗钱', '传销', '非法集资', '高利贷', '裸贷',
    '代开发票', '套现', '洗钱', '跑分', '黑钱', '赃款',
    '杀猪盘', '庞氏骗局', '割韭菜', '资金盘',
    // 人身犯罪
    '代孕', '买卖人体器官', '贩卖人口', '拐卖', '偷渡',
    '卖肾', '人体交易', '人口贩卖',
    // 网络违规
    '翻墙', 'VPN', 'vpn', '科学上网', '梯子', '代理工具',
    // 游戏违规
    '私服', '外挂', '作弊', '辅助', '脚本', '刷钻',
    // 版权侵权
    '盗版', '破解版', '注册机', 'KeyGen', 'keygen',
    '激活码', '序列号生成', '免费领取VIP',
    // 其他违规
    '代写', '代考', '枪手', '买卖身份证', '办证',
    '假证', '伪造', '洗白', '灰色产业', '黑产'
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
