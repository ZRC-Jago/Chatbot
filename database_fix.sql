-- 修正后的 SQL 代码
-- 主要修复：prompt 字段允许 NULL（因为视频可能没有提示词）

-- 如果表已存在，需要先修改 prompt 字段
ALTER TABLE public.artworks 
ALTER COLUMN prompt DROP NOT NULL;

-- 如果表不存在，使用以下完整代码创建：

-- 创建作品表（存储用户生成的图片和视频）
CREATE TABLE IF NOT EXISTS public.artworks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  prompt TEXT, -- 修改：允许 NULL（视频可能没有提示词）
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  thumbnail_url TEXT, -- 视频缩略图URL（可选）
  is_public BOOLEAN DEFAULT true, -- 是否公开到社区
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON public.artworks(user_id);
CREATE INDEX IF NOT EXISTS idx_artworks_is_public ON public.artworks(is_public);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON public.artworks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_file_type ON public.artworks(file_type);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_artworks_updated_at
  BEFORE UPDATE ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 Row Level Security (RLS)
ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

-- RLS 策略：所有人都可以查看公开的作品
CREATE POLICY "任何人都可以查看公开的作品"
  ON public.artworks
  FOR SELECT
  USING (is_public = true);

-- RLS 策略：用户可以查看自己的所有作品（包括私有的）
CREATE POLICY "用户可以查看自己的作品"
  ON public.artworks
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 策略：用户可以插入自己的作品
CREATE POLICY "用户可以创建自己的作品"
  ON public.artworks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 策略：用户可以更新自己的作品
CREATE POLICY "用户可以更新自己的作品"
  ON public.artworks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS 策略：用户可以删除自己的作品
CREATE POLICY "用户可以删除自己的作品"
  ON public.artworks
  FOR DELETE
  USING (auth.uid() = user_id);

-- 可选：创建点赞表（如果需要点赞功能）
CREATE TABLE IF NOT EXISTS public.artwork_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artwork_id UUID NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(artwork_id, user_id) -- 防止重复点赞
);

CREATE INDEX IF NOT EXISTS idx_artwork_likes_artwork_id ON public.artwork_likes(artwork_id);
CREATE INDEX IF NOT EXISTS idx_artwork_likes_user_id ON public.artwork_likes(user_id);

-- 点赞表的 RLS 策略
ALTER TABLE public.artwork_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人都可以查看点赞"
  ON public.artwork_likes
  FOR SELECT
  USING (true);

CREATE POLICY "用户可以点赞"
  ON public.artwork_likes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以取消点赞"
  ON public.artwork_likes
  FOR DELETE
  USING (auth.uid() = user_id);

-- 可选：创建评论表（如果需要评论功能）
CREATE TABLE IF NOT EXISTS public.artwork_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artwork_id UUID NOT NULL REFERENCES public.artworks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artwork_comments_artwork_id ON public.artwork_comments(artwork_id);
CREATE INDEX IF NOT EXISTS idx_artwork_comments_user_id ON public.artwork_comments(user_id);

-- 评论表的更新时间触发器（可选，如果将来需要更新评论功能）
CREATE TRIGGER update_artwork_comments_updated_at
  BEFORE UPDATE ON public.artwork_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 评论表的 RLS 策略
ALTER TABLE public.artwork_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "任何人都可以查看评论"
  ON public.artwork_comments
  FOR SELECT
  USING (true);

CREATE POLICY "用户可以创建评论"
  ON public.artwork_comments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的评论"
  ON public.artwork_comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的评论"
  ON public.artwork_comments
  FOR DELETE
  USING (auth.uid() = user_id);
