-- 自定义智能体功能数据库表
-- 用于存储用户自定义的智能体和社区分享的智能体

-- ==================== 1. 自定义智能体表 ====================
CREATE TABLE IF NOT EXISTS public.custom_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,  -- 智能体名字
  avatar VARCHAR(10),  -- 头像文字（如"城"），如果为空则使用名字第一个字
  system_prompt TEXT NOT NULL,  -- 自定义系统提示词
  voice VARCHAR(100) NOT NULL,  -- 音色ID（如"fnlp/MOSS-TTSD-v0.5:benjamin"）
  welcome_message TEXT,  -- 欢迎消息，如果为空则使用默认格式
  description TEXT,  -- 描述（用于分享）
  is_shared BOOLEAN DEFAULT false,  -- 是否分享到社区
  shared_at TIMESTAMP WITH TIME ZONE,  -- 分享时间
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_custom_agents_user_id ON public.custom_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_agents_shared ON public.custom_agents(is_shared) WHERE is_shared = true;
CREATE INDEX IF NOT EXISTS idx_custom_agents_created_at ON public.custom_agents(created_at DESC);

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建更新时间触发器
CREATE TRIGGER update_custom_agents_updated_at
  BEFORE UPDATE ON public.custom_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 Row Level Security (RLS)
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户可以查看自己的智能体
CREATE POLICY "用户可以查看自己的智能体"
  ON public.custom_agents
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 策略：用户可以创建自己的智能体
CREATE POLICY "用户可以创建自己的智能体"
  ON public.custom_agents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 策略：用户可以更新自己的智能体
CREATE POLICY "用户可以更新自己的智能体"
  ON public.custom_agents
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS 策略：用户可以删除自己的智能体
CREATE POLICY "用户可以删除自己的智能体"
  ON public.custom_agents
  FOR DELETE
  USING (auth.uid() = user_id);

-- RLS 策略：所有人都可以查看已分享的智能体（用于社区浏览）
CREATE POLICY "所有人都可以查看已分享的智能体"
  ON public.custom_agents
  FOR SELECT
  USING (is_shared = true);

-- ==================== 2. 社区分享智能体表 ====================
-- 用于记录社区分享的智能体，便于统计使用次数和管理
CREATE TABLE IF NOT EXISTS public.shared_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_name VARCHAR(100),  -- 创建者名字（冗余字段，便于查询）
  creator_email TEXT,  -- 创建者邮箱（冗余字段，便于查询）
  name VARCHAR(100) NOT NULL,  -- 智能体名字（冗余字段，便于查询）
  description TEXT,  -- 描述（冗余字段，便于查询）
  usage_count INTEGER DEFAULT 0,  -- 使用次数（被其他用户复制的次数）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(agent_id)  -- 确保每个智能体只能有一条分享记录
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_shared_agents_agent_id ON public.shared_agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_shared_agents_creator_id ON public.shared_agents(creator_id);
CREATE INDEX IF NOT EXISTS idx_shared_agents_created_at ON public.shared_agents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_agents_usage_count ON public.shared_agents(usage_count DESC);

-- 创建更新时间触发器
CREATE TRIGGER update_shared_agents_updated_at
  BEFORE UPDATE ON public.shared_agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 Row Level Security (RLS)
ALTER TABLE public.shared_agents ENABLE ROW LEVEL SECURITY;

-- RLS 策略：所有人都可以查看分享的智能体
CREATE POLICY "所有人都可以查看分享的智能体"
  ON public.shared_agents
  FOR SELECT
  USING (true);

-- RLS 策略：用户可以创建自己的分享记录
CREATE POLICY "用户可以创建自己的分享记录"
  ON public.shared_agents
  FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- RLS 策略：用户可以更新自己的分享记录
CREATE POLICY "用户可以更新自己的分享记录"
  ON public.shared_agents
  FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- RLS 策略：用户可以删除自己的分享记录
CREATE POLICY "用户可以删除自己的分享记录"
  ON public.shared_agents
  FOR DELETE
  USING (auth.uid() = creator_id);

-- RLS 策略：允许任何人更新使用次数（用于统计）
CREATE POLICY "任何人都可以更新使用次数"
  ON public.shared_agents
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- ==================== 3. 使用记录表（可选，用于更详细的使用统计）====================
-- 如果需要记录哪些用户使用了哪些分享的智能体，可以使用此表
CREATE TABLE IF NOT EXISTS public.agent_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shared_agent_id UUID NOT NULL REFERENCES public.shared_agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(shared_agent_id, user_id)  -- 每个用户对每个智能体只记录一次使用
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_agent_usage_logs_shared_agent_id ON public.agent_usage_logs(shared_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_usage_logs_user_id ON public.agent_usage_logs(user_id);

-- 启用 Row Level Security (RLS)
ALTER TABLE public.agent_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户可以查看自己的使用记录
CREATE POLICY "用户可以查看自己的使用记录"
  ON public.agent_usage_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 策略：用户可以创建自己的使用记录
CREATE POLICY "用户可以创建自己的使用记录"
  ON public.agent_usage_logs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS 策略：智能体创建者可以查看自己智能体的使用记录（用于统计）
CREATE POLICY "智能体创建者可以查看使用记录"
  ON public.agent_usage_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.shared_agents
      WHERE shared_agents.id = agent_usage_logs.shared_agent_id
      AND shared_agents.creator_id = auth.uid()
    )
  );
