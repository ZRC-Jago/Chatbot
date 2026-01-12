# 支付功能集成说明

## 已完成的功能

1. ✅ 支付 UI 组件 (`components/pricing.tsx`)
   - 订阅付费：$5/月 (prod_3KsUwoLdRYf0AJt13cRaks)
   - 一次性支付：$20 (prod_1M6yb3ZGysGUHKNwnlMV8P)

2. ✅ Checkout API (`app/api/checkout/route.ts`)
   - 集成 Supabase 认证
   - 创建 Creem 支付会话
   - 绑定用户信息

3. ✅ Webhook 处理 (`app/api/webhook/route.ts`)
   - 处理一次性支付完成事件
   - 处理订阅生命周期事件（激活、取消、过期）

4. ✅ 支付页面 (`app/pricing/page.tsx`)
   - 独立的支付选择页面

5. ✅ 首页支付入口
   - 登录后显示"支付"按钮

## 环境变量配置

在 `.env.local` 文件中添加以下配置：

```env
# Creem 支付配置
CREEM_API_KEY=你的_Creem_API_Key
SUCCESS_URL=http://localhost:3000/?payment=success
```

## Supabase 数据库设置

### 1. 创建表结构

在 Supabase Dashboard 中执行 `supabase-schema.sql` 文件中的 SQL 语句，或使用以下步骤：

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)
2. 选择你的项目
3. 进入 SQL Editor
4. 复制 `supabase-schema.sql` 文件内容并执行

### 2. 配置 Webhook URL

在 Creem Dashboard 中配置 webhook URL：

```
https://你的域名/api/webhook
```

如果是本地开发，可以使用 ngrok：

```bash
ngrok http 3000
# 然后使用 ngrok 提供的 URL: https://xxxx.ngrok.io/api/webhook
```

## 使用流程

1. **用户登录**
   - 用户通过 Google 登录

2. **选择支付方式**
   - 点击首页的"支付"按钮
   - 或访问 `/pricing` 页面
   - 选择订阅或一次性支付

3. **完成支付**
   - 跳转到 Creem 支付页面
   - 完成支付后返回成功页面

4. **Webhook 处理**
   - Creem 发送 webhook 到 `/api/webhook`
   - 系统自动更新用户支付状态

## 查询用户支付状态

### 检查用户是否有订阅

```typescript
const { data: subscription } = await supabase
  .from('subscriptions')
  .select('*')
  .eq('user_id', user.id)
  .eq('status', 'active')
  .single()

if (subscription) {
  // 用户有活跃订阅
}
```

### 检查用户是否有一次性支付

```typescript
const { data: purchase } = await supabase
  .from('one_time_purchases')
  .select('*')
  .eq('user_id', user.id)
  .eq('product_id', 'prod_1M6yb3ZGysGUHKNwnlMV8P')
  .single()

if (purchase) {
  // 用户已购买一次性产品
}
```

## 注意事项

1. **环境变量**：确保 `CREEM_API_KEY` 和 `SUCCESS_URL` 已正确配置
2. **Webhook 安全**：生产环境建议添加 webhook 签名验证
3. **错误处理**：已添加基础错误处理，可根据需要扩展
4. **数据库权限**：RLS 策略已配置，用户只能查看自己的记录

## 测试

1. 启动开发服务器：`pnpm dev`
2. 使用 ngrok 暴露本地服务：`ngrok http 3000`
3. 在 Creem Dashboard 配置 webhook URL
4. 测试支付流程








