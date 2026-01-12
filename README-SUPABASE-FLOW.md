# Supabase 支付和会员系统流程说明

## 完整流程

### 1. 用户登录（Supabase Auth）
- 用户点击"登录"按钮
- 跳转到 Google 登录页面
- 登录成功后，用户信息存储在 Supabase 的 `auth.users` 表中（自动管理）
- 回调到 `/auth/callback`，创建会话

### 2. 用户支付（Creem）
- 用户点击"支付"按钮，选择订阅或一次性支付
- 跳转到 Creem 支付页面
- 用户完成支付

### 3. Webhook 存储支付信息（Supabase）
- Creem 发送 webhook 到 `/api/webhook`
- Webhook 处理程序将支付信息存储到 Supabase：
  - **订阅支付** → 存储到 `subscriptions` 表
  - **一次性支付** → 存储到 `one_time_purchases` 表
- 存储的信息包括：
  - 用户 ID（关联到 `auth.users`）
  - 产品 ID
  - 支付状态
  - Creem 客户 ID

### 4. 用户登录后检查会员状态
- 用户登录后，系统自动调用 `getUserMembership()`
- 查询 Supabase 数据库：
  1. 先检查 `one_time_purchases` 表 → 永久会员
  2. 再检查 `subscriptions` 表 → 订阅会员
  3. 如果都没有 → 普通用户
- 根据会员类型设置聊天限制：
  - 游客：3次/天
  - 普通用户：10次/天
  - 会员/永久会员：无限次

## 数据库表结构

### `one_time_purchases` - 一次性支付记录
```sql
- id: 支付记录 ID（来自 Creem）
- user_id: 用户 ID（关联 auth.users）
- product_id: 产品 ID（prod_1M6yb3ZGysGUHKNwnlMV8P）
- provider_customer_id: Creem 客户 ID
- status: 支付状态（completed）
- created_at: 创建时间
- updated_at: 更新时间
```

### `subscriptions` - 订阅记录
```sql
- id: 订阅 ID（来自 Creem）
- user_id: 用户 ID（关联 auth.users）
- product_id: 产品 ID（prod_3KsUwoLdRYf0AJt13cRaks）
- provider_customer_id: Creem 客户 ID
- status: 订阅状态（active/canceled/expired）
- created_at: 创建时间
- updated_at: 更新时间
```

### `chat_usage` - 聊天使用记录
```sql
- id: 记录 ID
- user_id: 用户 ID（关联 auth.users）
- date: 日期（YYYY-MM-DD）
- count: 当日聊天次数
- created_at: 创建时间
- updated_at: 更新时间
```

## 设置步骤

### 1. 创建数据库表

在 Supabase Dashboard 的 SQL Editor 中执行 `supabase-schema.sql`：

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 复制 `supabase-schema.sql` 文件内容
5. 点击 **Run** 执行

### 2. 配置 Webhook

在 Creem Dashboard 中配置 webhook URL：

- **本地开发**：使用 ngrok 暴露的 URL
  ```
  https://xxxx.ngrok.io/api/webhook
  ```
- **生产环境**：你的域名
  ```
  https://你的域名.com/api/webhook
  ```

### 3. 验证流程

1. **登录** → 检查会员类型（应该显示"普通用户"）
2. **支付** → 完成支付流程
3. **等待 Webhook** → Creem 发送 webhook（可能需要几秒）
4. **刷新页面** → 会员类型应该更新为"会员"或"永久会员"

## 数据流程图

```
用户登录
  ↓
Supabase Auth (auth.users)
  ↓
用户点击支付
  ↓
Creem 支付页面
  ↓
支付成功
  ↓
Creem Webhook → /api/webhook
  ↓
存储到 Supabase:
  - subscriptions 表（订阅）
  - one_time_purchases 表（一次性）
  ↓
用户刷新/重新登录
  ↓
getUserMembership() 查询 Supabase
  ↓
显示会员类型和权限
```

## 检查会员状态

系统会在以下时机检查会员状态：
1. 页面加载时
2. 用户登录后
3. 认证状态变化时

会员类型优先级：
1. 永久会员（one_time_purchases）
2. 订阅会员（subscriptions，status=active）
3. 普通用户（已登录但未付费）
4. 游客（未登录）







