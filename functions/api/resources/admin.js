// functions/api/resources/admin.js
// 管理员操作：审核/删除资源 + 分类配置管理
import { DEFAULT_TABS, invalidateTypes, ensureTypesTable } from './_types.js';

function checkAuth(request) {
  const authHeader = request.headers.get('Authorization');
  const adminToken = 'wyj122731';
  return authHeader === `Bearer ${adminToken}`;
}

function err(msg) {
  return Response.json({ success: false, error: msg });
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

  // 分类配置列表（含停用项）
  if (url.searchParams.get('list') === 'types') {
    const query = () => env.RESOURCES_DB.prepare(
      "SELECT id, name, parent, grp, sort, enabled FROM resource_types ORDER BY CASE WHEN parent = '' THEN 0 ELSE 1 END, parent, sort, id"
    ).all();
    try {
      const rows = await query();
      return Response.json({ success: true, results: rows.results || [] });
    } catch (e) {
      try {
        await ensureTypesTable(env);
        const rows = await query();
        return Response.json({ success: true, results: rows.results || [] });
      } catch (e2) {
        return Response.json({ success: false, error: '查询失败' });
      }
    }
  }

  const status = url.searchParams.get('status') || 'pending';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200'), 500);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const offset = (page - 1) * limit;

  try {
    const results = await env.RESOURCES_DB.prepare(
        "SELECT id, title, link, type, source, status, submitted_by, email, player_count, genre, created_at FROM resources WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
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

  if (!action) {
    return Response.json({ success: false, error: '缺少参数' });
  }
  if ((action === 'update_status' || action === 'delete') && !id) {
    return Response.json({ success: false, error: '缺少参数' });
  }

  try {
    // ---- 分类配置管理 ----
    if (action === 'type_init') {
      await ensureTypesTable(env);
      const cnt = await env.RESOURCES_DB.prepare("SELECT COUNT(*) as c FROM resource_types").first();
      if (cnt && cnt.c > 0) {
        return err('分类表已有数据，未执行初始化');
      }
      let topIndex = 0;
      for (const tab of DEFAULT_TABS) {
        topIndex++;
        await env.RESOURCES_DB.prepare(
          "INSERT INTO resource_types (name, parent, grp, sort, enabled) VALUES (?, '', ?, ?, 1)"
        ).bind(tab.name, tab.grp || 1, topIndex).run();
        let i = 0;
        for (const child of tab.children) {
          i++;
          await env.RESOURCES_DB.prepare(
            "INSERT INTO resource_types (name, parent, grp, sort, enabled) VALUES (?, ?, 0, ?, 1)"
          ).bind(child, tab.name, i).run();
        }
      }
      invalidateTypes();
      return Response.json({ success: true, message: '默认分类已初始化' });
    }

    if (action === 'type_add') {
      const name = String(body.name || '').trim();
      const parent = String(body.parent || '').trim();
      if (!name || name.length > 20) return err('分类名需为 1-20 个字符');
      if (name === '全部') return err('不能使用"全部"作为分类名');
      const dup = await env.RESOURCES_DB.prepare("SELECT id FROM resource_types WHERE name = ?").bind(name).first();
      if (dup) return err('分类名已存在：' + name);
      if (parent) {
        if (parent === name) return err('所属分类不能是自身');
        const p = await env.RESOURCES_DB.prepare("SELECT id FROM resource_types WHERE name = ? AND parent = ''").bind(parent).first();
        if (!p) return err('所属分类不存在：' + parent);
      }
      let sort = parseInt(body.sort, 10);
      if (!Number.isFinite(sort)) {
        const row = await env.RESOURCES_DB.prepare("SELECT MAX(sort) as m FROM resource_types WHERE parent = ?").bind(parent).first();
        sort = (row && row.m ? row.m : 0) + 1;
      }
      const grp = parent ? 0 : (Number.isFinite(parseInt(body.grp, 10)) ? parseInt(body.grp, 10) : 1);
      await env.RESOURCES_DB.prepare(
        "INSERT INTO resource_types (name, parent, grp, sort, enabled) VALUES (?, ?, ?, ?, 1)"
      ).bind(name, parent, grp, sort).run();
      invalidateTypes();
      return Response.json({ success: true, message: '已添加分类：' + name });
    }

    if (action === 'type_update') {
      const row = await env.RESOURCES_DB.prepare("SELECT * FROM resource_types WHERE id = ?").bind(id).first();
      if (!row) return err('分类不存在');

      const sets = [];
      const vals = [];

      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 20) return err('分类名需为 1-20 个字符');
        if (name !== row.name) {
          const dup = await env.RESOURCES_DB.prepare("SELECT id FROM resource_types WHERE name = ?").bind(name).first();
          if (dup) return err('分类名已存在：' + name);
          sets.push('name = ?'); vals.push(name);
        }
      }
      if (body.sort !== undefined) {
        const sort = parseInt(body.sort, 10);
        if (!Number.isFinite(sort)) return err('排序需为数字');
        sets.push('sort = ?'); vals.push(sort);
      }
      if (body.grp !== undefined && !row.parent) {
        const grp = parseInt(body.grp, 10);
        if (!Number.isFinite(grp)) return err('分组需为数字');
        sets.push('grp = ?'); vals.push(grp);
      }
      if (body.enabled !== undefined) {
        sets.push('enabled = ?'); vals.push(body.enabled ? 1 : 0);
      }
      if (sets.length === 0) return err('没有要更新的字段');

      sets.push("updated_at = datetime('now')");
      await env.RESOURCES_DB.prepare(
        `UPDATE resource_types SET ${sets.join(', ')} WHERE id = ?`
      ).bind(...vals, id).run();

      if (body.name !== undefined && String(body.name).trim() !== row.name && !row.parent) {
        await env.RESOURCES_DB.prepare(
          "UPDATE resource_types SET parent = ?, updated_at = datetime('now') WHERE parent = ?"
        ).bind(String(body.name).trim(), row.name).run();
      }
      invalidateTypes();
      return Response.json({ success: true, message: '分类已更新' });
    }

    if (action === 'type_reorder') {
      const ids = (Array.isArray(body.ids) ? body.ids : [])
        .map(x => parseInt(x, 10)).filter(Number.isFinite);
      if (ids.length === 0) return err('缺少排序列表');
      const rows = await env.RESOURCES_DB.prepare(
        `SELECT id, parent FROM resource_types WHERE id IN (${ids.map(() => '?').join(', ')})`
      ).bind(...ids).all();
      const list = rows.results || [];
      if (list.length !== ids.length) return err('排序列表包含无效分类');
      if (list.some(r => r.parent !== list[0].parent)) return err('只能在同一层级内排序');
      await env.RESOURCES_DB.batch(
        ids.map((id, i) => env.RESOURCES_DB.prepare(
          "UPDATE resource_types SET sort = ?, updated_at = datetime('now') WHERE id = ?"
        ).bind(i + 1, id))
      );
      invalidateTypes();
      return Response.json({ success: true, message: '排序已更新' });
    }

    if (action === 'type_delete') {
      const row = await env.RESOURCES_DB.prepare("SELECT * FROM resource_types WHERE id = ?").bind(id).first();
      if (!row) return err('分类不存在');
      if (!row.parent) {
        await env.RESOURCES_DB.prepare("DELETE FROM resource_types WHERE parent = ?").bind(row.name).run();
      }
      await env.RESOURCES_DB.prepare("DELETE FROM resource_types WHERE id = ?").bind(id).run();
      invalidateTypes();
      return Response.json({ success: true, message: '已删除分类' + (row.parent ? '' : '及其子标签') });
    }

    // ---- 批量导入（本地工具入库，按 link 去重，单次最多 200 条）----
    if (action === 'import') {
      const rows = Array.isArray(body.items) ? body.items : [];
      if (rows.length === 0) return err('缺少 items');
      if (rows.length > 200) return err('单次最多 200 条，当前 ' + rows.length + ' 条');

      const bad = [];
      const norm = rows.map((r, i) => {
        const title = String(r.title || '').trim();
        const link = String(r.link || '').trim();
        const type = String(r.type || '其他').trim() || '其他';
        const status = ['approved', 'rejected', 'pending'].includes(r.status)
          ? r.status : 'approved';
        if (!title || title.length > 200) bad.push(`#${i + 1} 标题为空或超过200字符`);
        if (!/^https?:\/\//.test(link)) bad.push(`#${i + 1} 链接非法`);
        if (type.length > 20) bad.push(`#${i + 1} 分类超过20字符`);
        return {
          title: title.slice(0, 200),
          link,
          type,
          status,
          keywords: String(r.keywords || '').slice(0, 500),
          source: String(r.source || 'user').slice(0, 20) || 'user',
          submitted_by: String(r.submitted_by || 'weiyingjun').slice(0, 50),
        };
      });
      if (bad.length) return err('数据校验失败：' + bad.slice(0, 5).join('；'));

      // 按 link 去重（跳过库里已有的链接）
      const links = norm.map(r => r.link);
      const existed = await env.RESOURCES_DB.prepare(
        `SELECT link FROM resources WHERE link IN (${links.map(() => '?').join(',')})`
      ).bind(...links).all();
      const dupSet = new Set(((existed && existed.results) || []).map(r => r.link));
      const todo = norm.filter(r => !dupSet.has(r.link));

      if (todo.length > 0) {
        const insertStmt = env.RESOURCES_DB.prepare(
          'INSERT INTO resources (title, link, type, keywords, source, status, submitted_by, ' +
          'created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
        );
        await env.RESOURCES_DB.batch(todo.map(r => insertStmt.bind(
          r.title, r.link, r.type, r.keywords, r.source, r.status, r.submitted_by
        )));
      }

      return Response.json({
        success: true,
        received: norm.length,
        inserted: todo.length,
        skipped: dupSet.size,
        skipped_links: [...dupSet].slice(0, 500),
      });
    }

    // ---- 资源审核 ----
    if (action === 'update_status' && status) {
      if (!['approved', 'rejected', 'pending'].includes(status)) {
        return Response.json({ success: false, error: '无效的状态' });
      }

      const resource = await env.RESOURCES_DB.prepare(
        "SELECT submitted_by FROM resources WHERE id = ?"
      ).bind(id).first();

      await env.RESOURCES_DB.prepare(
        "UPDATE resources SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).bind(status, id).run();

      if (status === 'approved' && resource && resource.submitted_by && !resource.submitted_by.startsWith('ip:')) {
        const user = await env.RESOURCES_DB.prepare(
          "SELECT id FROM users WHERE username = ?"
        ).bind(resource.submitted_by).first();
        if (user) {
          await env.RESOURCES_DB.prepare("UPDATE users SET points = points + 1 WHERE id = ?").bind(user.id).run();
          await env.RESOURCES_DB.prepare(
            "INSERT INTO points_log (user_id, change_amount, change_type, description) VALUES (?, 1, 'approved', '资源审核通过 +1')"
          ).bind(user.id).run();
        }
      }

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
