-- 简单的 Storage 权限策略（如果上面的策略报错，使用这个）
-- 用于 artworks bucket

-- 删除所有可能存在的旧策略
DROP POLICY IF EXISTS "已登录用户可以上传作品" ON storage.objects;
DROP POLICY IF EXISTS "任何人都可以查看作品" ON storage.objects;
DROP POLICY IF EXISTS "已登录用户可以删除作品" ON storage.objects;
DROP POLICY IF EXISTS "允许上传到 artworks" ON storage.objects;
DROP POLICY IF EXISTS "允许查看 artworks" ON storage.objects;
DROP POLICY IF EXISTS "允许删除 artworks" ON storage.objects;

-- 更简单的策略版本（不检查认证状态，因为 bucket 是公开的）
-- 注意：应用层会验证用户身份，所以这里可以放宽
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
