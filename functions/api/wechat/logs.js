// functions/api/wechat/logs.js
// 查询机器人收发记录（含回复内容）
// GET /api/wechat/logs?q=关键词&kind=post&limit=50&page=1

function checkAuth(request) {
  const authHeader = request.headers.get('Authorization');
  const adminToken = 'wyj122731';
  return authHeader === `Bearer ${adminToken}`;
}

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!checkAuth(request)) {
    return Response.json({ success: false, error: '未授权' }, { status: 401 });
  }

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const kind = (url.searchParams.get('kind') || '').trim().slice(0, 20);
  const from = (url.searchParams.get('from') || '').trim().slice(0, 64);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const offset = (page - 1) * limit;

  const where = [];
  const params = [];
  if (kind) { where.push('kind = ?'); params.push(kind); }
  if (from) { where.push('from_user = ?'); params.push(from); }
  if (q) {
    where.push('(from_user LIKE ? OR body LIKE ? OR note LIKE ? OR reply LIKE ?)');
    params.push('%' + q + '%', '%' + q + '%', '%' + q + '%', '%' + q + '%');
  }
  const whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';

  try {
    const rows = await env.RESOURCES_DB.prepare(
      'SELECT * FROM wechat_logs' + whereSql + ' ORDER BY id DESC LIMIT ? OFFSET ?'
    ).bind(...params, limit, offset).all();
    const countRow = await env.RESOURCES_DB.prepare(
      'SELECT COUNT(*) as total FROM wechat_logs' + whereSql
    ).bind(...params).first();
    return Response.json({
      success: true,
      results: rows.results || [],
      total: countRow?.total || 0,
      page,
      limit
    });
  } catch (err) {
    return Response.json({ success: false, error: '查询失败（旧表缺 reply 列时请执行 schema-logs.sql 中的 ALTER）' });
  }
}
