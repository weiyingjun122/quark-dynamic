-- 微信消息日志表（收发记录，含机器人回复内容）
CREATE TABLE IF NOT EXISTS wechat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT DEFAULT 'post',
  sig_ok INTEGER DEFAULT 0,
  msg_type TEXT DEFAULT '',
  from_user TEXT DEFAULT '',
  body TEXT DEFAULT '',
  note TEXT DEFAULT '',
  reply TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wechat_logs_created ON wechat_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wechat_logs_from ON wechat_logs(from_user);

-- 已存在的旧表只需补一列，在 D1 控制台执行一次：
-- ALTER TABLE wechat_logs ADD COLUMN reply TEXT DEFAULT '';
