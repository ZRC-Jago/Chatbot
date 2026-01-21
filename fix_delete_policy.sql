-- 修复删除权限策略
-- 如果删除作品时遇到权限错误，执行此 SQL

-- 删除旧的删除策略（如果存在）
DROP POLICY IF EXISTS "用户可以删除自己的作品" ON public.artworks;

-- 重新创建删除策略
CREATE POLICY "用户可以删除自己的作品"
ON public.artworks
FOR DELETE
USING (auth.uid() = user_id);

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
WHERE tablename = 'artworks'
  AND policyname = '用户可以删除自己的作品';
