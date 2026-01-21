-- Supabase Storage 权限策略
-- 用于 artworks bucket

-- 删除所有可能存在的旧策略（如果存在）
DROP POLICY IF EXISTS "用户可以上传自己的作品" ON storage.objects;
DROP POLICY IF EXISTS "任何人都可以查看作品" ON storage.objects;
DROP POLICY IF EXISTS "用户可以删除自己的作品" ON storage.objects;
DROP POLICY IF EXISTS "已登录用户可以上传作品" ON storage.objects;
DROP POLICY IF EXISTS "已登录用户可以删除作品" ON storage.objects;
DROP POLICY IF EXISTS "允许上传到 artworks" ON storage.objects;
DROP POLICY IF EXISTS "允许查看 artworks" ON storage.objects;
DROP POLICY IF EXISTS "允许删除 artworks" ON storage.objects;

-- 上传策略（INSERT）- 允许所有已登录用户上传到 artworks bucket
CREATE POLICY "已登录用户可以上传作品"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'artworks' AND
  auth.role() = 'authenticated'
);

-- 读取策略（SELECT）- 任何人都可以查看（因为 bucket 是公开的）
CREATE POLICY "任何人都可以查看作品"
ON storage.objects
FOR SELECT
USING (bucket_id = 'artworks');

-- 删除策略（DELETE）- 允许所有已登录用户删除
-- 注意：应用层会验证用户只能删除自己的作品
CREATE POLICY "已登录用户可以删除作品"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'artworks' AND
  auth.role() = 'authenticated'
);

-- 如果上面的策略报错，可以尝试更简单的版本（不检查认证状态）
-- 因为 bucket 设置为公开，且应用层会验证用户身份
/*
CREATE POLICY "允许上传到 artworks"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'artworks');

CREATE POLICY "允许查看 artworks"
ON storage.objects
FOR SELECT
USING (bucket_id = 'artworks');

CREATE POLICY "允许删除 artworks"
ON storage.objects
FOR DELETE
USING (bucket_id = 'artworks');
*/
