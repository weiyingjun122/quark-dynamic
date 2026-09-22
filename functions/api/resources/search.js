// functions/api/resources/search.js
// GET /api/resources/search?q=关键词&type=类型&player_count=人数&genre=类型&page=1&limit=20
export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置', results: [] }, { status: 500 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || '';
  const playerCount = url.searchParams.get('player_count') || '';
  const genre = url.searchParams.get('genre') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  // 搜索次数限制
  const DAILY_LIMIT_UNLOGGED = 5;
  const DAILY_LIMIT_LOGGED = 10;
  const today = new Date().toISOString().split('T')[0];

  // 获取用户标识（已登录用user_id，未登录用IP）
  let identifier = '';
  let isLogged = false;
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, env.JWT_SECRET || 'wyj-resource-site-secret-2026');
    if (payload && payload.id) {
      identifier = 'user:' + payload.id;
      isLogged = true;
    }
  }
  if (!identifier) {
    identifier = 'ip:' + (request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown');
  }

  const maxLimit = isLogged ? DAILY_LIMIT_LOGGED : DAILY_LIMIT_UNLOGGED;

  try {
    // 查询今日已用次数
    const used = await env.RESOURCES_DB.prepare(
      'SELECT search_count FROM search_limits WHERE identifier = ? AND date = ?'
    ).bind(identifier, today).first();

    const usedCount = used?.search_count || 0;

    if (usedCount >= maxLimit) {
      return Response.json({
        success: false,
        error: 'rate_limited',
        message: isLogged ? '今日搜索次数已用完' : '未登录用户每日限搜' + DAILY_LIMIT_UNLOGGED + '次，请登录获取更多次数',
        used: usedCount,
        limit: maxLimit,
        remaining: 0
      }, { status: 429 });
    }

    // 更新次数
    if (used) {
      await env.RESOURCES_DB.prepare(
        'UPDATE search_limits SET search_count = search_count + 1 WHERE identifier = ? AND date = ?'
      ).bind(identifier, today).run();
    } else {
      await env.RESOURCES_DB.prepare(
        'INSERT INTO search_limits (identifier, date, search_count) VALUES (?, ?, 1)'
      ).bind(identifier, today).run();
    }

    const remaining = maxLimit - usedCount - 1;

  try {
    let results = [];
    let total = 0;

    // 构建WHERE条件
    let conditions = ["status = 'approved'"];
    let params = [];

    if (type && type !== '全部') {
      if (type === '兴趣技能') {
        const hobby = url.searchParams.get('keywords') || '';
        if (hobby && hobby !== '全部') {
          conditions.push("type = ?");
          params.push(hobby);
        } else {
          conditions.push("type IN (?, ?, ?, ?, ?)");
          params.push('摄影剪辑', '付费课程', '编程开发', '媒体运营', '学习攻略');
        }
      } else if (type === '语文阅读') {
        const reading = url.searchParams.get('keywords') || '';
        if (reading && reading !== '全部') {
          conditions.push("type = ?");
          params.push(reading);
        } else {
          conditions.push("type IN (?, ?, ?, ?, ?, ?, ?, ?)");
          params.push('语文阅读一区', '语文阅读二区', '英汉双语阅读', '半小时漫画', '知乎盐选', '四大名著', '豆瓣畅销书', '百科全书');
        }
      } else {
        conditions.push("type = ?");
        params.push(type);
      }
    }

    if (playerCount && playerCount !== '全部') {
      conditions.push("player_count = ?");
      params.push(parseInt(playerCount));
    }

    if (genre && genre !== '全部') {
      conditions.push("genre = ?");
      params.push(genre);
    }

    if (q.trim()) {
      conditions.push("(title LIKE ? OR keywords LIKE ?)");
      params.push(`%${q.trim()}%`, `%${q.trim()}%`);
    }

    const whereClause = conditions.join(' AND ');

    const countResult = await env.RESOURCES_DB.prepare(
      `SELECT COUNT(*) as total FROM resources WHERE ${whereClause}`
    ).bind(...params).first();
    total = countResult?.total || 0;

    const stmt = env.RESOURCES_DB.prepare(
      `SELECT id, title, link, type, keywords, source, view_count, created_at, player_count, genre FROM resources WHERE ${whereClause} ORDER BY view_count DESC, created_at DESC LIMIT ? OFFSET ?`
    );
    results = await stmt.bind(...params, limit, offset).all();

    return Response.json({
      success: true,
      results: results.results || [],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      remaining,
      limit: maxLimit
    });

  } catch (err) {
    return Response.json({ success: false, error: '搜索失败', results: [] }, { status: 500 });
  }
}

// JWT验证函数
async function verifyToken(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0)),
      encoder.encode(parts[0] + '.' + parts[1])
    );
    return valid ? payload : null;
  } catch (e) {
    return null;
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://www.weiyingjun.top',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
