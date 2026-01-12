-- ============================================
-- 订阅数据库优化 - 添加到期时间字段
-- ============================================
-- 执行说明：
-- 1. 登录 Supabase Dashboard
-- 2. 进入 SQL Editor
-- 3. 复制此文件的所有内容
-- 4. 粘贴到 SQL Editor 中
-- 5. 点击 "Run" 执行
-- ============================================

-- 步骤 1: 添加 expires_at 字段到 subscriptions 表
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- 步骤 2: 为现有订阅设置默认到期时间
-- 注意：这里设置为创建时间 + 30天（月订阅）
-- 如果 Creem webhook 提供了实际的到期时间，会在下次 webhook 时更新
UPDATE subscriptions 
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL AND status = 'active';

-- 步骤 3: 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_expires ON subscriptions(user_id, status, expires_at);

-- 步骤 4: 验证修改
-- 检查字段是否添加成功
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'subscriptions' 
    AND column_name = 'expires_at'
  ) THEN
    RAISE NOTICE '✅ expires_at 字段已成功添加到 subscriptions 表';
  ELSE
    RAISE EXCEPTION '❌ expires_at 字段添加失败';
  END IF;
END $$;

-- 显示当前订阅统计信息
SELECT 
  status,
  COUNT(*) as count,
  COUNT(CASE WHEN expires_at IS NOT NULL THEN 1 END) as with_expires_at,
  COUNT(CASE WHEN expires_at IS NULL THEN 1 END) as without_expires_at
FROM subscriptions
GROUP BY status;

-- 显示即将到期的订阅（7天内）
SELECT 
  id,
  user_id,
  product_id,
  status,
  expires_at,
  created_at
FROM subscriptions
WHERE status = 'active' 
  AND expires_at IS NOT NULL
  AND expires_at <= NOW() + INTERVAL '7 days'
ORDER BY expires_at ASC;






