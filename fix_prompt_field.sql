-- 简单直接的修复：只修改 prompt 字段
-- 如果表已存在且有数据，这个脚本会安全地修改字段

-- 方法1：直接修改（如果表中没有数据或所有数据都有 prompt）
ALTER TABLE public.artworks 
ALTER COLUMN prompt DROP NOT NULL;

-- 如果上面的语句报错，尝试方法2（先检查是否有空值约束）
-- 先查看当前约束
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'public.artworks'::regclass 
--   AND contype = 'c';

-- 如果方法1失败，可能需要先处理数据
-- 方法2：如果有数据且 prompt 为空的记录，先更新它们
-- UPDATE public.artworks SET prompt = NULL WHERE prompt = '';

-- 然后再执行方法1
