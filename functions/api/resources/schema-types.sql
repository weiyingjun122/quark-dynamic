-- 分类配置表（搜索页标签 / 提交页类型 / 后端聚合的单一数据源）
-- 执行方式：npx wrangler d1 execute resources-db --remote --file=functions/api/resources/schema-types.sql

CREATE TABLE IF NOT EXISTS resource_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent TEXT NOT NULL DEFAULT '',
  grp INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_types_name ON resource_types(name);

-- 种子数据：与当前线上分类一致（parent='' 为顶级标签，否则为子标签）
INSERT OR IGNORE INTO resource_types (name, parent, grp, sort, enabled) VALUES
  ('少儿',     '',   1, 1,  1),
  ('小学',     '',   1, 2,  1),
  ('初中',     '',   1, 3,  1),
  ('高中',     '',   1, 4,  1),
  ('专升本',   '',   1, 5,  1),
  ('大学',     '',   1, 6,  1),
  ('四六级',   '',   1, 7,  1),
  ('考研',     '',   1, 8,  1),
  ('教资',     '',   1, 9,  1),
  ('剧本杀',   '',   2, 10, 1),
  ('语文阅读', '',   2, 11, 1),
  ('电子书',   '',   2, 12, 1),
  ('兴趣技能', '',   3, 13, 1),
  ('语文阅读一区', '语文阅读', 0, 1, 1),
  ('语文阅读二区', '语文阅读', 0, 2, 1),
  ('英汉双语阅读', '语文阅读', 0, 3, 1),
  ('半小时漫画',   '语文阅读', 0, 4, 1),
  ('知乎盐选',     '语文阅读', 0, 5, 1),
  ('四大名著',     '语文阅读', 0, 6, 1),
  ('豆瓣畅销书',   '语文阅读', 0, 7, 1),
  ('百科全书',     '语文阅读', 0, 8, 1),
  ('摄影剪辑', '兴趣技能', 0, 1, 1),
  ('付费课程', '兴趣技能', 0, 2, 1),
  ('编程开发', '兴趣技能', 0, 3, 1),
  ('媒体运营', '兴趣技能', 0, 4, 1),
  ('学习攻略', '兴趣技能', 0, 5, 1),
  ('实用资源', '兴趣技能', 0, 6, 1),
  ('哲学宗教', '电子书', 0, 1, 1),
  ('文学',     '电子书', 0, 2, 1),
  ('教育学习', '电子书', 0, 3, 1);
