-- 邮箱验证码表（注册时校验邮箱真实性）
-- 执行方式：wrangler d1 execute resources-db --remote --file functions/api/auth/schema-email-codes.sql
CREATE TABLE IF NOT EXISTS email_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT DEFAULT 'register',
  expires_at INTEGER NOT NULL,
  attempts INTEGER DEFAULT 0,
  used INTEGER DEFAULT 0,
  ip TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_codes_lookup ON email_codes(email, used, expires_at);
CREATE INDEX IF NOT EXISTS idx_email_codes_ip ON email_codes(ip, created_at);
