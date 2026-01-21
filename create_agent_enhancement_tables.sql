-- 智能体增强功能数据库表
-- 用于支持工具调用、记忆系统、主动能力

-- ==================== 1. 用户偏好记忆表 ====================
-- 存储用户的长期偏好、设置、身体状况等信息
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.custom_agents(id) ON DELETE CASCADE,  -- 关联到特定智能体（可选）
  key VARCHAR(100) NOT NULL,  -- 偏好键（如 "age", "diet_preference", "activity_level"）
  value TEXT,  -- 偏好值（JSON格式，支持复杂数据）
  category VARCHAR(50),  -- 分类（如 "health", "diet", "exercise", "general"）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, agent_id, key)  -- 每个用户在每个智能体下每个键只能有一条记录
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_agent_id ON public.user_preferences(agent_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_category ON public.user_preferences(category);

-- 更新时间触发器
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的偏好"
  ON public.user_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的偏好"
  ON public.user_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的偏好"
  ON public.user_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的偏好"
  ON public.user_preferences
  FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== 2. 工具调用日志表 ====================
-- 记录智能体调用的工具及其结果，用于调试和优化
CREATE TABLE IF NOT EXISTS public.tool_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  conversation_id TEXT,  -- 会话ID（关联到聊天历史）
  tool_name VARCHAR(100) NOT NULL,  -- 工具名称
  tool_arguments JSONB,  -- 工具参数（JSON格式）
  tool_result JSONB,  -- 工具返回结果（JSON格式）
  success BOOLEAN DEFAULT true,  -- 是否成功
  error_message TEXT,  -- 错误信息（如果失败）
  execution_time_ms INTEGER,  -- 执行时间（毫秒）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_user_id ON public.tool_call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_agent_id ON public.tool_call_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_conversation_id ON public.tool_call_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_tool_name ON public.tool_call_logs(tool_name);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_created_at ON public.tool_call_logs(created_at DESC);

-- 启用 RLS
ALTER TABLE public.tool_call_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的工具调用日志"
  ON public.tool_call_logs
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "系统可以创建工具调用日志"
  ON public.tool_call_logs
  FOR INSERT
  WITH CHECK (true);  -- 允许系统记录

-- ==================== 3. 主动任务表 ====================
-- 存储智能体需要主动执行的任务（提醒、跟进等）
CREATE TABLE IF NOT EXISTS public.proactive_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,  -- 任务类型（如 "reminder", "follow_up", "progress_check"）
  task_data JSONB,  -- 任务数据（JSON格式，包含任务详情）
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,  -- 计划执行时间
  executed_at TIMESTAMP WITH TIME ZONE,  -- 实际执行时间
  status VARCHAR(20) DEFAULT 'pending',  -- 状态：pending, executed, failed, cancelled
  result JSONB,  -- 执行结果（JSON格式）
  error_message TEXT,  -- 错误信息
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_proactive_tasks_user_id ON public.proactive_tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_proactive_tasks_agent_id ON public.proactive_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_proactive_tasks_status ON public.proactive_tasks(status);
CREATE INDEX IF NOT EXISTS idx_proactive_tasks_scheduled_at ON public.proactive_tasks(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_proactive_tasks_pending ON public.proactive_tasks(scheduled_at) 
  WHERE status = 'pending';  -- 部分索引，只索引待执行的任务

-- 更新时间触发器
CREATE TRIGGER update_proactive_tasks_updated_at
  BEFORE UPDATE ON public.proactive_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS
ALTER TABLE public.proactive_tasks ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的任务"
  ON public.proactive_tasks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的任务"
  ON public.proactive_tasks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的任务"
  ON public.proactive_tasks
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的任务"
  ON public.proactive_tasks
  FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== 4. 用户目标追踪表 ====================
-- 存储用户设定的目标和完成情况
CREATE TABLE IF NOT EXISTS public.user_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  goal_type VARCHAR(50) NOT NULL,  -- 目标类型（如 "weight_loss", "exercise", "sleep"）
  goal_description TEXT NOT NULL,  -- 目标描述
  target_value NUMERIC,  -- 目标值（如目标体重、目标步数等）
  current_value NUMERIC,  -- 当前值
  unit VARCHAR(20),  -- 单位（如 "kg", "steps", "hours"）
  start_date DATE,  -- 开始日期
  target_date DATE,  -- 目标日期
  status VARCHAR(20) DEFAULT 'active',  -- 状态：active, completed, paused, cancelled
  progress_data JSONB,  -- 进度数据（JSON格式，记录历史进度）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON public.user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_agent_id ON public.user_goals(agent_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON public.user_goals(status);
CREATE INDEX IF NOT EXISTS idx_user_goals_goal_type ON public.user_goals(goal_type);

-- 更新时间触发器
CREATE TRIGGER update_user_goals_updated_at
  BEFORE UPDATE ON public.user_goals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的目标"
  ON public.user_goals
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的目标"
  ON public.user_goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的目标"
  ON public.user_goals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的目标"
  ON public.user_goals
  FOR DELETE
  USING (auth.uid() = user_id);

-- ==================== 5. 对话上下文记忆表 ====================
-- 存储重要的对话上下文，用于跨会话记忆
CREATE TABLE IF NOT EXISTS public.conversation_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.custom_agents(id) ON DELETE CASCADE,
  memory_type VARCHAR(50) NOT NULL,  -- 记忆类型（如 "user_fact", "preference", "important_event"）
  content TEXT NOT NULL,  -- 记忆内容
  importance INTEGER DEFAULT 5,  -- 重要性（1-10，10最重要）
  tags TEXT[],  -- 标签（用于检索）
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,  -- 最后访问时间（用于记忆管理）
  access_count INTEGER DEFAULT 0  -- 访问次数
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_conversation_memories_user_id ON public.conversation_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_agent_id ON public.conversation_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_type ON public.conversation_memories(memory_type);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_importance ON public.conversation_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_memories_tags ON public.conversation_memories USING GIN(tags);  -- GIN索引支持数组查询

-- 更新时间触发器
CREATE TRIGGER update_conversation_memories_updated_at
  BEFORE UPDATE ON public.conversation_memories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 启用 RLS
ALTER TABLE public.conversation_memories ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "用户可以查看自己的记忆"
  ON public.conversation_memories
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "用户可以创建自己的记忆"
  ON public.conversation_memories
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以更新自己的记忆"
  ON public.conversation_memories
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "用户可以删除自己的记忆"
  ON public.conversation_memories
  FOR DELETE
  USING (auth.uid() = user_id);
