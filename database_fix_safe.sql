-- 安全的数据库修复脚本
-- 先检查表是否存在，然后安全地修改字段

-- 1. 检查并修改 prompt 字段（如果表已存在）
-- 如果 prompt 字段当前是 NOT NULL，需要先检查是否有数据，然后修改

-- 方法1：如果表中没有数据，可以直接修改
DO $$
BEGIN
  -- 检查表是否存在
  IF EXISTS (SELECT FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'artworks') THEN
    
    -- 检查 prompt 字段是否允许 NULL
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'artworks' 
      AND column_name = 'prompt' 
      AND is_nullable = 'NO'
    ) THEN
      -- 如果字段不允许 NULL，先修改为允许 NULL
      ALTER TABLE public.artworks ALTER COLUMN prompt DROP NOT NULL;
      RAISE NOTICE '已修改 prompt 字段，现在允许 NULL';
    ELSE
      RAISE NOTICE 'prompt 字段已经允许 NULL，无需修改';
    END IF;
  ELSE
    RAISE NOTICE 'artworks 表不存在，请先创建表';
  END IF;
END $$;

-- 2. 如果表不存在，创建完整的表结构
CREATE TABLE IF NOT EXISTS public.artworks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  user_name TEXT,
  prompt TEXT, -- 允许 NULL（视频可能没有提示词）
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'video')),
  thumbnail_url TEXT,
  is_public BOOLEAN DEFAULT true,
  likes_count INTEGER DEFAULT 0,
  views_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_artworks_user_id ON public.artworks(user_id);
CREATE INDEX IF NOT EXISTS idx_artworks_is_public ON public.artworks(is_public);
CREATE INDEX IF NOT EXISTS idx_artworks_created_at ON public.artworks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artworks_file_type ON public.artworks(file_type);

-- 4. 创建或替换更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. 创建或替换触发器（如果已存在会先删除）
DROP TRIGGER IF EXISTS update_artworks_updated_at ON public.artworks;
CREATE TRIGGER update_artworks_updated_at
  BEFORE UPDATE ON public.artworks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. 启用 RLS（如果未启用）
ALTER TABLE public.artworks ENABLE ROW LEVEL SECURITY;

-- 7. 删除旧的策略（如果存在），然后重新创建
DROP POLICY IF EXISTS "任何人都可以查看公开的作品" ON public.artworks;
DROP POLICY IF EXISTS "用户可以查看自己的作品" ON public.artworks;
DROP POLICY IF EXISTS "用户可以创建自己的作品" ON public.artworks;
DROP POLICY IF EXISTS "用户可以更新自己的作品" ON public.artworks;
DROP POLICY IF EXISTS "用户可以删除自己的作品" ON public.artworks;

-- 重新创建策略
CREATE POLICY "任何人都可以查看公开的作品"
  ON public.artworks
  FOR SELECT
  USING (is_public = true);

CREATE POLICY "用户可以查看自己的作品"
  ON public.artworks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的作品"
  ON public.artworks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的作品"
  ON public.artworks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的作品"
  ON public.artworks
  FOR DELETE
  USING (auth.uid() = user_id);
