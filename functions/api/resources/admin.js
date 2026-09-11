// functions/api/resources/admin.js
// 管理员操作：审核/删除资源

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
  const status = url.searchParams.get('status') || 'pending';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = 50;
  const offset = (page - 1) * limit;

  try {
    const results = await env.RESOURCES_DB.prepare(
      "SELECT id, title, link, type, source, status, submitted_by, email, created_at FROM resources WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
    ).bind(status, limit, offset).all();

    const countResult = await env.RESOURCES_DB.prepare(
      "SELECT COUNT(*) as total FROM resources WHERE status = ?"
    ).bind(status).first();

    return Response.json({
      success: true,
      results: results.results || [],
      total: countResult?.total || 0,
      page
    });

  } catch (err) {
    return Response.json({ success: false, error: '查询失败' });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!checkAuth(request)) {
    return Response.json({ success: false, error: '未授权' }, { status: 401 });
  }

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求格式错误' });
  }

  const { action, id, status } = body;

  if (!action || !id) {
    return Response.json({ success: false, error: '缺少参数' });
  }

  try {
    if (action === 'update_status' && status) {
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return Response.json({ success: false, error: '无效的状态' });
      }
      await env.RESOURCES_DB.prepare(
        "UPDATE resources SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(status, id).run();
      return Response.json({ success: true, message: `资源已更新为 ${status}` });
    }

    if (action === 'delete') {
      await env.RESOURCES_DB.prepare("DELETE FROM resources WHERE id = ?").bind(id).run();
      return Response.json({ success: true, message: '资源已删除' });
    }

    return Response.json({ success: false, error: '未知操作' });

  } catch (err) {
    return Response.json({ success: false, error: '操作失败' });
  }
}
