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
      for (const tab of DEFAULT_TABS) {
        await env.RESOURCES_DB.prepare(
          "INSERT INTO resource_types (name, parent, grp, sort, enabled) VALUES (?, '', ?, ?, 1)"
        ).bind(tab.name, tab.grp || 1, 0).run();
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
