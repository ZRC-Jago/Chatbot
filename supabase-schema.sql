-- Supabase 数据库表结构
-- 用于存储 Creem 支付和订阅信息

-- 一次性支付表
CREATE TABLE IF NOT EXISTS one_time_purchases (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  provider_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP WITH TIME ZONE, -- 订阅到期时间，用于支持续费和到期检查
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_one_time_purchases_user_id ON one_time_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_one_time_purchases_product_id ON one_time_purchases(product_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_expires ON subscriptions(user_id, status, expires_at);

-- 启用 Row Level Security (RLS)
ALTER TABLE one_time_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能查看自己的支付记录
CREATE POLICY "Users can view their own purchases"
  ON one_time_purchases
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own subscriptions"
  ON subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS 策略：允许服务端插入（用于 webhook）
CREATE POLICY "Service can insert purchases"
  ON one_time_purchases
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service can insert subscriptions"
  ON subscriptions
  FOR INSERT
  WITH CHECK (true);

-- RLS 策略：允许服务端更新（用于 webhook）
CREATE POLICY "Service can update subscriptions"
  ON subscriptions
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- 聊天使用记录表
-- 用于记录用户每日聊天次数
CREATE TABLE IF NOT EXISTS chat_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_chat_usage_user_id ON chat_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_usage_date ON chat_usage(date);

-- 启用 Row Level Security (RLS)
ALTER TABLE chat_usage ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能查看和更新自己的记录
CREATE POLICY "Users can view their own chat usage"
  ON chat_usage
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chat usage"
  ON chat_usage
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own chat usage"
  ON chat_usage
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

