// functions/api/resources/view.js
// POST /api/resources/view - 增加资源浏览次数
export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.RESOURCES_DB) {
    return Response.json({ success: false, error: '数据库未配置' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求格式错误' });
  }

  const { id } = body;
  if (!id) {
    return Response.json({ success: false, error: '缺少资源ID' });
  }

  try {
    await env.RESOURCES_DB.prepare(
      "UPDATE resources SET view_count = view_count + 1 WHERE id = ? AND status = 'approved'"
    ).bind(id).run();

    return Response.json({ success: true });

  } catch (err) {
    return Response.json({ success: false, error: '记录失败' });
  }
}
