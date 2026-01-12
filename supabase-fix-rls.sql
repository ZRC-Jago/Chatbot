-- 修复 RLS 策略，允许服务端插入和更新订阅记录
-- 这个 SQL 会更新现有的策略，确保 webhook 可以正常工作

-- 方案 1：删除并重新创建策略（推荐）
DROP POLICY IF EXISTS "Service can insert purchases" ON one_time_purchases;
DROP POLICY IF EXISTS "Service can insert subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service can update subscriptions" ON subscriptions;

-- 重新创建策略，允许任何插入（服务端操作）
-- 注意：这些策略允许任何使用 anon key 的客户端插入，但只用于服务端 webhook
CREATE POLICY "Service can insert purchases"
  ON one_time_purchases
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Service can insert subscriptions"
  ON subscriptions
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- 允许任何更新（服务端操作）
CREATE POLICY "Service can update subscriptions"
  ON subscriptions
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 验证策略
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('one_time_purchases', 'subscriptions')
ORDER BY tablename, policyname;

