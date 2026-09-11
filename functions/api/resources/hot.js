// functions/api/resources/hot.js
// GET /api/resources/hot?limit=10 - 热门资源
export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置', results: [] });
  }

  const url = new URL(request.url);
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get('limit') || '10')));

  try {
    const results = await env.RESOURCES_DB.prepare(
      "SELECT id, title, type, keywords, view_count, created_at FROM resources WHERE status = 'approved' ORDER BY view_count DESC, created_at DESC LIMIT ?"
    ).bind(limit).all();

    return Response.json({
      success: true,
      results: results.results || []
    });

  } catch (err) {
    return Response.json({ success: false, error: '获取失败', results: [] });
  }
}
