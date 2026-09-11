// functions/api/auth/checkin.js
// POST /api/auth/checkin - 每日签到获取积分

async function verifyToken(env, request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const secret = env.JWT_SECRET || 'wyj-resource-site-secret-2026';
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = s.replace(/-/g, '+').replace(/_/g, '/');
    const sigPadded = sigStr + '='.repeat((4 - sigStr.length % 4) % 4);
    const sigBytes = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(h + '.' + p));
    if (!valid) return null;
    const payload = JSON.parse(atob(p));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function getBeijingDate() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

function calcPoints(consecutive) {
  if (consecutive >= 30) return 20;
  if (consecutive >= 7) return 10;
  return 5;
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = await verifyToken(env, request);
  if (!user) return Response.json({ success: false, error: '请先登录' }, { status: 401 });

  if (!env.RESOURCES_DB) return Response.json({ success: false, error: '数据库未配置' });

  const today = getBeijingDate();

  try {
    const existing = await env.RESOURCES_DB.prepare(
      "SELECT id FROM checkins WHERE user_id = ? AND checkin_date = ?"
    ).bind(user.id, today).first();
    if (existing) {
      return Response.json({ success: false, error: '今天已经签到过了' });
    }

    const userInfo = await env.RESOURCES_DB.prepare(
      "SELECT consecutive_days, last_checkin, points FROM users WHERE id = ?"
    ).bind(user.id).first();

    let consecutive = 1;
    if (userInfo && userInfo.last_checkin) {
      const lastDate = new Date(userInfo.last_checkin + 'T00:00:00+08:00');
      const todayDate = new Date(today + 'T00:00:00+08:00');
      const diffDays = Math.floor((todayDate - lastDate) / (24 * 3600 * 1000));
      if (diffDays === 1) {
        consecutive = (userInfo.consecutive_days || 0) + 1;
      } else if (diffDays > 1) {
        consecutive = 1;
      }
    }

    const points = calcPoints(consecutive);
    const currentPoints = (userInfo && userInfo.points) || 0;

    await env.RESOURCES_DB.prepare(
      "INSERT INTO checkins (user_id, checkin_date, points_earned, consecutive_days) VALUES (?, ?, ?, ?)"
    ).bind(user.id, today, points, consecutive).run();

    await env.RESOURCES_DB.prepare(
      "UPDATE users SET points = ?, consecutive_days = ?, last_checkin = ? WHERE id = ?"
    ).bind(currentPoints + points, consecutive, today, user.id).run();

    await env.RESOURCES_DB.prepare(
      "INSERT INTO points_log (user_id, change_amount, change_type, description) VALUES (?, ?, 'checkin', ?)"
    ).bind(user.id, points, `每日签到 +${points}（连续${consecutive}天）`).run();

    return Response.json({
      success: true,
      points,
      consecutive,
      totalPoints: currentPoints + points,
      message: `签到成功！获得 ${points} 积分（连续${consecutive}天）`
    });

  } catch (err) {
    return Response.json({ success: false, error: '签到失败: ' + err.message });
  }
}
