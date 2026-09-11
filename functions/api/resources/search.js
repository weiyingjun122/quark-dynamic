// functions/api/resources/search.js
// GET /api/resources/search?q=关键词&type=类型&page=1&limit=20
export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置', results: [] }, { status: 500 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const offset = (page - 1) * limit;

  try {
    let results = [];
    let total = 0;

    if (q.trim()) {
      const searchTerm = `%${q.trim()}%`;

      if (type && type !== '全部') {
        const countResult = await env.RESOURCES_DB.prepare(
          "SELECT COUNT(*) as total FROM resources WHERE status = 'approved' AND type = ? AND (title LIKE ? OR keywords LIKE ?)"
        ).bind(type, searchTerm, searchTerm).first();
        total = countResult?.total || 0;

        const stmt = env.RESOURCES_DB.prepare(
          "SELECT id, title, link, type, keywords, source, view_count, created_at FROM resources WHERE status = 'approved' AND type = ? AND (title LIKE ? OR keywords LIKE ?) ORDER BY view_count DESC, created_at DESC LIMIT ? OFFSET ?"
        );
        results = await stmt.bind(type, searchTerm, searchTerm, limit, offset).all();
      } else {
        const countResult = await env.RESOURCES_DB.prepare(
          "SELECT COUNT(*) as total FROM resources WHERE status = 'approved' AND (title LIKE ? OR keywords LIKE ?)"
        ).bind(searchTerm, searchTerm).first();
        total = countResult?.total || 0;

        const stmt = env.RESOURCES_DB.prepare(
          "SELECT id, title, link, type, keywords, source, view_count, created_at FROM resources WHERE status = 'approved' AND (title LIKE ? OR keywords LIKE ?) ORDER BY view_count DESC, created_at DESC LIMIT ? OFFSET ?"
        );
        results = await stmt.bind(searchTerm, searchTerm, limit, offset).all();
      }
    } else {
      if (type && type !== '全部') {
        const countResult = await env.RESOURCES_DB.prepare(
          "SELECT COUNT(*) as total FROM resources WHERE status = 'approved' AND type = ?"
        ).bind(type).first();
        total = countResult?.total || 0;

        results = await env.RESOURCES_DB.prepare(
          "SELECT id, title, link, type, keywords, source, view_count, created_at FROM resources WHERE status = 'approved' AND type = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(type, limit, offset).all();
      } else {
        const countResult = await env.RESOURCES_DB.prepare(
          "SELECT COUNT(*) as total FROM resources WHERE status = 'approved'"
        ).first();
        total = countResult?.total || 0;

        results = await env.RESOURCES_DB.prepare(
          "SELECT id, title, link, type, keywords, source, view_count, created_at FROM resources WHERE status = 'approved' ORDER BY created_at DESC LIMIT ? OFFSET ?"
        ).bind(limit, offset).all();
      }
    }

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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
