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

CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(status);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(type);
CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_view_count ON resources(view_count DESC);
