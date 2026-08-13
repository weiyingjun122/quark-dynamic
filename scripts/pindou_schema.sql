-- 拼豆卡密表 schema (Cloudflare D1)
-- 使用方法: wrangler d1 execute pindou-cards --file=scripts/pindou_schema.sql

CREATE TABLE IF NOT EXISTS pindou_cards (
    code        TEXT PRIMARY KEY,              -- 卡密, 14位大写字母数字 (剔除 0/O/1/I)
    plan        TEXT NOT NULL,                 -- 1d / 7d / forever
    status      TEXT NOT NULL DEFAULT 'available',  -- available / redeemed
    device_fp   TEXT,                          -- 兑换绑定的设备指纹
    redeemed_at TEXT,                          -- 兑换时间 (ISO UTC)
    expires_at  TEXT                           -- 到期时间 (ISO UTC), forever 为 NULL
);

CREATE INDEX IF NOT EXISTS idx_pindou_cards_status ON pindou_cards(status);