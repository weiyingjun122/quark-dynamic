// functions/api/resources/types.js
// GET /api/resources/types  分类配置（搜索页/提交页共用，免鉴权）
// 返回：{ success, tabs:[{name, grp, children:[]}], types:[可提交类型...] }
import { getTaxonomy, flatTypes } from './_types.js';

export async function onRequestGet(context) {
  const { env, request } = context;

  try {
    const url = new URL(request.url);
    const tabs = await getTaxonomy(env, url.searchParams.get('fresh') === '1');
    return Response.json(
      { success: true, tabs, types: flatTypes(tabs) },
      { headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  } catch (err) {
    return Response.json({ success: false, error: '获取分类失败', tabs: [], types: [] }, { status: 500 });
  }
}
