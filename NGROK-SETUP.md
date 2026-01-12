# 使用 ngrok 暴露本地服务（用于 Creem 支付）

## 问题

Creem 支付需要能够访问你的 `successUrl` 来完成支付流程。如果你使用 `localhost`，Creem 无法访问，会导致 "Failed to initialize payment" 错误。

## 解决方案：使用 ngrok

### 1. 安装 ngrok

访问 [ngrok 官网](https://ngrok.com/) 注册账号并下载 ngrok。

或者使用包管理器安装：
```bash
# Windows (使用 Chocolatey)
choco install ngrok

# macOS (使用 Homebrew)
brew install ngrok

# 或直接下载
# https://ngrok.com/download
```

### 2. 启动 ngrok

在终端中运行：
```bash
ngrok http 3000
```

这会显示类似这样的输出：
```
Forwarding   https://xxxx-xxxx-xxxx.ngrok-free.app -> http://localhost:3000
```

### 3. 配置环境变量

在 `.env.local` 文件中添加：
```env
SUCCESS_URL=https://xxxx-xxxx-xxxx.ngrok-free.app/account
```

**重要**：将 `xxxx-xxxx-xxxx` 替换为你实际的 ngrok URL。

### 4. 重启开发服务器

修改 `.env.local` 后，需要重启 Next.js 开发服务器：
```bash
# 停止当前服务器 (Ctrl+C)
# 然后重新启动
pnpm dev
```

### 5. 配置 Creem Webhook（如果需要）

在 Creem Dashboard 中配置 webhook URL：
```
https://xxxx-xxxx-xxxx.ngrok-free.app/api/webhook
```

## 注意事项

1. **免费版 ngrok URL 会变化**：每次重启 ngrok 都会生成新的 URL，需要更新 `.env.local`
2. **付费版可以固定域名**：ngrok 付费版可以设置固定域名
3. **生产环境**：部署到生产环境后，使用你的实际域名，不需要 ngrok

## 测试

配置完成后：
1. 启动 ngrok：`ngrok http 3000`
2. 更新 `.env.local` 中的 `SUCCESS_URL`
3. 重启开发服务器
4. 尝试支付，应该可以正常工作了







