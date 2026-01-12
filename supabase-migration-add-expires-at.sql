-- 添加到期时间字段到 subscriptions 表
-- 用于支持订阅续费和到期检查

-- 添加 expires_at 字段
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- 为现有订阅设置默认到期时间（30天后）
-- 注意：这只是一个临时值，实际应该从 Creem webhook 获取
UPDATE subscriptions 
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL AND status = 'active';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_expires ON subscriptions(user_id, status, expires_at);






