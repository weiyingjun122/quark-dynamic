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
      totalPages: Math.ceil(total / limit)
    });

  } catch (err) {
    return Response.json({ success: false, error: '搜索失败', results: [] }, { status: 500 });
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
