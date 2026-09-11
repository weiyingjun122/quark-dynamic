-- 资源表
CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  type TEXT DEFAULT '其他',
  keywords TEXT DEFAULT '',
  source TEXT DEFAULT 'user',
  status TEXT DEFAULT 'pending',
  submitted_by TEXT DEFAULT '',
  email TEXT DEFAULT '',
  view_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_view_count ON resources(view_count DESC);

-- 全文搜索索引（可选，提升搜索性能）
-- CREATE VIRTUAL TABLE IF NOT EXISTS resources_fts USING fts5(title, keywords, content=resources, content_rowid=id);
