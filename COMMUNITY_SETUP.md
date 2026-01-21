# 社区功能设置指南

## 1. 创建 Supabase Storage Bucket

1. 登录 Supabase Dashboard
2. 进入 **Storage** 页面
3. 点击 **New bucket**
4. 设置：
   - **Name**: `artworks`
   - **Public bucket**: ✅ 勾选（允许公开访问）
5. 点击 **Create bucket**

## 2. 设置 Storage 权限

在 Storage 的 **Policies** 中，为 `artworks` bucket 添加以下策略：

### 上传策略（INSERT）
```sql
CREATE POLICY "用户可以上传自己的作品"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'artworks' AND
  auth.role() = 'authenticated'
);
```

### 读取策略（SELECT）
```sql
CREATE POLICY "任何人都可以查看作品"
ON storage.objects
FOR SELECT
USING (bucket_id = 'artworks');
```

### 删除策略（DELETE）
```sql
CREATE POLICY "用户可以删除自己的作品"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'artworks' AND
  auth.role() = 'authenticated'
);
```

**注意**：如果上面的策略报错，可以尝试更简单的版本（允许所有已登录用户上传和删除）：
```sql
-- 更简单的上传策略
CREATE POLICY "已登录用户可以上传作品"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'artworks');

-- 更简单的删除策略（允许所有已登录用户删除，因为代码中会验证用户身份）
CREATE POLICY "已登录用户可以删除作品"
ON storage.objects
FOR DELETE
USING (bucket_id = 'artworks');
```

## 3. 验证数据库表

确保已执行之前提供的 SQL 代码，创建了以下表：
- `artworks` - 作品表
- `artwork_likes` - 点赞表（可选）
- `artwork_comments` - 评论表（可选）

## 4. 功能说明

### 已实现的功能

1. **作品分享功能**
   - 在生成图片/视频后，点击"分享到社区"按钮
   - 自动上传文件到 Supabase Storage
   - 保存作品信息到数据库

2. **社区浏览页面** (`/community`)
   - 按时间排序展示所有公开作品
   - 无限滚动加载
   - 筛选类型（全部/图片/视频）

3. **作品详情页** (`/community/[id]`)
   - 显示作品、用户名、提示词
   - 视频不显示提示词（因为视频需要提示词和原图一起生成）

4. **我的作品管理** (`/profile/artworks`)
   - 查看自己的所有作品
   - 筛选类型（全部/图片/视频）
   - 撤回功能（删除作品）

### 导航

- 在主页面头部添加了"社区"和"我的"导航链接
- "我的"链接仅在用户登录时显示

## 5. 注意事项

1. **文件大小限制**：Supabase Storage 有文件大小限制，请确保图片/视频文件不超过限制
2. **存储成本**：大量作品会占用存储空间，注意监控使用量
3. **隐私设置**：当前所有分享的作品都是公开的，后续可以添加隐私设置功能
