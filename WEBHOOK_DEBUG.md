# Webhook 调试指南

## 确认代码逻辑

**是的，代码确实是在收到 Creem webhook 后才更新数据库的。**

流程如下：
1. 用户点击"立即支付" → 调用 `/api/checkout` → 创建 Creem 支付链接
2. 用户完成支付 → Creem 处理支付
3. **Creem 发送 webhook** → 你的服务器 `/api/webhook` 接收
4. **收到 webhook 后** → 更新数据库 `one_time_purchases` 表

## 如何验证支付是否成功

### 方法 1: 检查服务器日志

查看你的服务器控制台（运行 `npm run dev` 的终端），查找以下日志：

**成功的情况：**
```
[v0] ========== Webhook 请求收到 ==========
[v0] 事件类型: checkout.completed
[v0] 支付类型: 一次性
[v0] ✅ 用户 xxx 完成一次性支付: product_xxx
[v0] ✅ 支付记录已成功存储到 Supabase one_time_purchases 表
```

**失败的情况：**
```
[v0] ⚠️ 未处理的一次性支付事件类型: xxx
```
或
```
[v0] ❌ 存储一次性支付记录错误: ...
```

### 方法 2: 检查 Supabase 数据库

1. 登录 Supabase Dashboard
2. 进入 **Table Editor**
3. 查看 `one_time_purchases` 表
4. 检查是否有新记录（订单 ID、用户 ID、产品 ID）

### 方法 3: 检查 Creem Webhook 配置

1. 登录 Creem Dashboard
2. 进入 **Webhooks** 设置
3. 确认 webhook URL 正确配置：
   - 本地开发：`https://your-ngrok-url.ngrok.io/api/webhook`
   - 生产环境：`https://your-domain.com/api/webhook`
4. 查看 webhook 发送历史（如果有）

## 常见问题

### 问题 1: Creem 后台没有显示支付记录

**这是正常的！** Creem 的统计系统可能只统计订阅类型的支付，一次性支付可能不会在 Creem 后台显示。但 webhook 仍然会正常触发，支付记录会保存到 Supabase 数据库中。

### 问题 2: 数据库中没有记录

可能的原因：
1. **Webhook 没有收到**
   - 检查 webhook URL 是否正确配置
   - 检查 ngrok 是否正常运行（本地开发）
   - 检查服务器日志是否有 webhook 请求

2. **事件类型不匹配**
   - Creem 可能使用了不同的事件类型
   - 查看服务器日志中的 `⚠️ 未处理的一次性支付事件类型`
   - 如果看到这个警告，需要更新代码支持新的事件类型

3. **数据库插入失败**
   - 检查 `one_time_purchases` 表是否存在
   - 检查用户 ID 是否正确（必须是有效的 UUID）
   - 查看服务器日志中的错误信息

### 问题 3: 如何测试 webhook

你可以手动发送测试 webhook 来验证：

```bash
curl -X POST https://your-ngrok-url.ngrok.io/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test_webhook_123",
    "eventType": "checkout.completed",
    "object": {
      "request_id": "your-user-id-here",
      "object": "checkout",
      "id": "test_order_123",
      "customer": {
        "id": "customer_123"
      },
      "product": {
        "id": "your-product-id",
        "billing_type": "one_time"
      },
      "status": "completed",
      "metadata": {
        "userId": "your-user-id-here"
      }
    }
  }'
```

**注意：** 将 `your-user-id-here` 替换为实际的用户 UUID，`your-product-id` 替换为实际的产品 ID。

## 调试步骤

1. **确认支付已完成**
   - 检查银行/支付账户是否有扣款记录
   - 检查 Creem 支付页面是否显示"支付成功"

2. **检查 webhook 是否被调用**
   - 查看服务器日志
   - 检查是否有 `[v0] ========== Webhook 请求收到 ==========` 日志

3. **检查 webhook 数据**
   - 查看日志中的完整 webhook 数据
   - 确认 `eventType` 是否为支持的类型
   - 确认 `userId` 是否正确

4. **检查数据库**
   - 登录 Supabase Dashboard
   - 查看 `one_time_purchases` 表
   - 确认是否有新记录

5. **如果仍然有问题**
   - 复制完整的服务器日志
   - 检查 webhook URL 配置
   - 确认 Supabase 表结构正确

## 支持的事件类型

当前代码支持以下一次性支付事件类型：
- `checkout.completed`
- `payment.completed`
- `purchase.completed`

如果 Creem 使用了其他事件类型，需要更新 `app/api/webhook/route.ts` 中的 `oneTimeEventTypes` 数组。





