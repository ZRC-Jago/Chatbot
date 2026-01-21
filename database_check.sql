-- 数据库诊断脚本
-- 用于检查当前表结构和可能的问题

-- 1. 检查 artworks 表是否存在
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'artworks'
    ) THEN 'artworks 表存在'
    ELSE 'artworks 表不存在'
  END AS table_status;

-- 2. 检查 prompt 字段的当前状态
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'artworks'
  AND column_name = 'prompt';

-- 3. 检查表中是否有数据
SELECT 
  COUNT(*) as total_rows,
  COUNT(prompt) as rows_with_prompt,
  COUNT(*) - COUNT(prompt) as rows_without_prompt
FROM public.artworks;

-- 4. 检查是否有约束阻止修改
SELECT 
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.artworks'::regclass
  AND conname LIKE '%prompt%';

-- 5. 检查 RLS 是否启用
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'artworks';
