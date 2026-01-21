-- 详细的修复脚本，包含所有可能的情况

-- 步骤1：检查当前状态
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_column_exists BOOLEAN;
  v_is_nullable TEXT;
  v_row_count INTEGER;
BEGIN
  -- 检查表是否存在
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'artworks'
  ) INTO v_table_exists;
  
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'artworks 表不存在，请先创建表';
  END IF;
  
  -- 检查 prompt 列是否存在
  SELECT EXISTS (
    SELECT FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'artworks' 
    AND column_name = 'prompt'
  ) INTO v_column_exists;
  
  IF NOT v_column_exists THEN
    RAISE EXCEPTION 'prompt 列不存在';
  END IF;
  
  -- 检查当前是否允许 NULL
  SELECT is_nullable 
  INTO v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' 
    AND table_name = 'artworks'
    AND column_name = 'prompt';
  
  RAISE NOTICE '当前 prompt 字段状态: %', v_is_nullable;
  
  -- 检查数据量
  SELECT COUNT(*) INTO v_row_count FROM public.artworks;
  RAISE NOTICE '表中当前有 % 条记录', v_row_count;
  
  -- 如果当前不允许 NULL，则修改
  IF v_is_nullable = 'NO' THEN
    RAISE NOTICE '开始修改 prompt 字段为允许 NULL...';
    ALTER TABLE public.artworks ALTER COLUMN prompt DROP NOT NULL;
    RAISE NOTICE '修改成功！prompt 字段现在允许 NULL';
  ELSE
    RAISE NOTICE 'prompt 字段已经允许 NULL，无需修改';
  END IF;
  
END $$;

-- 验证修改结果
SELECT 
  column_name,
  data_type,
  is_nullable,
  CASE 
    WHEN is_nullable = 'YES' THEN '✅ 允许 NULL'
    ELSE '❌ 不允许 NULL'
  END AS status
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'artworks'
  AND column_name = 'prompt';
