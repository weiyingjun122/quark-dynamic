// functions/api/resources/_types.js
// 分类配置单一数据源：读取 D1 resource_types 表，表为空/异常时回退内置默认配置。
// 搜索页标签、提交页类型说明、搜索接口聚合全部从这里取数。

// 与 schema-types.sql 种子数据保持一致（仅作兜底，正常时以数据库为准）
export const DEFAULT_TABS = [
  { name: '少儿', grp: 1, children: [] },
  { name: '小学', grp: 1, children: [] },
  { name: '初中', grp: 1, children: [] },
  { name: '高中', grp: 1, children: [] },
  { name: '专升本', grp: 1, children: [] },
  { name: '大学', grp: 1, children: [] },
  { name: '四六级', grp: 1, children: [] },
  { name: '考研', grp: 1, children: [] },
  { name: '教资', grp: 1, children: [] },
  { name: '剧本杀', grp: 2, children: [] },
  { name: '语文阅读', grp: 2, children: ['语文阅读一区', '语文阅读二区', '英汉双语阅读', '半小时漫画', '知乎盐选', '四大名著', '豆瓣畅销书', '百科全书'] },
  { name: '电子书', grp: 2, children: ['哲学宗教', '文学', '教育学习'] },
  { name: '兴趣技能', grp: 3, children: ['摄影剪辑', '付费课程', '编程开发', '媒体运营', '学习攻略', '实用资源'] }
];

const CACHE_TTL = 60 * 1000;
let cache = { at: 0, tabs: null };

export function invalidateTypes() {
  cache = { at: 0, tabs: null };
}

// 表不存在时自动建表（首次部署无需手动执行 SQL）
export async function ensureTypesTable(env) {
  await env.RESOURCES_DB.prepare(
    'CREATE TABLE IF NOT EXISTS resource_types (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, parent TEXT NOT NULL DEFAULT \'\',' +
    'grp INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1,' +
    'created_at TEXT DEFAULT (datetime(\'now\')), updated_at TEXT DEFAULT (datetime(\'now\')))'
  ).run();
}

export async function getTaxonomy(env, fresh) {
  if (!fresh && cache.tabs && Date.now() - cache.at < CACHE_TTL) {
    return cache.tabs;
  }

  let tabs = null;
  if (env.RESOURCES_DB) {
    const load = async () => {
      const rows = await env.RESOURCES_DB.prepare(
        "SELECT name, parent, grp, sort FROM resource_types WHERE enabled = 1 ORDER BY sort, id"
      ).all();
      const list = rows && rows.results ? rows.results : [];
      const tops = list.filter(r => !r.parent);
      if (tops.length === 0) return null;
      const childMap = {};
      list.filter(r => r.parent).forEach(r => {
        if (!childMap[r.parent]) childMap[r.parent] = [];
        childMap[r.parent].push(r.name);
      });
      return tops.map(t => ({ name: t.name, grp: t.grp || 1, children: childMap[t.name] || [] }));
    };
    try {
      tabs = await load();
    } catch (e) {
      // 表不存在时自动建表后重试一次
      try {
        await ensureTypesTable(env);
        tabs = await load();
      } catch (e2) {
        tabs = null;
      }
    }
  }

  if (!tabs) tabs = DEFAULT_TABS;
  cache = { at: Date.now(), tabs };
  return tabs;
}

// 有子标签的分类 -> 子标签数组（用于搜索接口的 type IN 聚合）
export function childrenMapOf(tabs) {
  const map = {};
  tabs.forEach(t => {
    if (t.children && t.children.length > 0) map[t.name] = t.children;
  });
  return map;
}

// 可提交的类型列表：无子标签的顶级分类 + 所有子标签 + 其他
export function flatTypes(tabs) {
  const list = [];
  tabs.forEach(t => {
    if (!t.children || t.children.length === 0) list.push(t.name);
    else t.children.forEach(c => list.push(c));
  });
  list.push('其他');
  return list;
}
