-- 在 Cloudflare D1 Console 中执行

-- 1. users 表增加积分和 VIP 字段
ALTER TABLE users ADD COLUMN points INTEGER DEFAULT 100;
ALTER TABLE users ADD COLUMN vip_level INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN vip_expire_at TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN consecutive_days INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_checkin TEXT DEFAULT '';

-- 2. 签到记录表
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  points_earned INTEGER NOT NULL,
  consecutive_days INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, checkin_date)
);
CREATE INDEX IF NOT EXISTS idx_checkins_user ON checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(checkin_date);

-- 3. 积分流水表
CREATE TABLE IF NOT EXISTS points_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  change_amount INTEGER NOT NULL,
  change_type TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_points_log_user ON points_log(user_id);

-- 4. 初始化：给已有用户100积分（如果还没有的话）
-- UPDATE users SET points = 100 WHERE points IS NULL;
