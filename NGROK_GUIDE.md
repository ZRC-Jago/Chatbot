# Ngrok 使用指南

## 什么是 Ngrok？

**Ngrok** 是一个内网穿透工具，可以将你本地运行的网站暴露到公网，让其他人可以通过互联网访问。

### 你的 URL 说明

`https://suzette-schmalzier-marriedly.ngrok-free.dev` 这个网址的作用是：

1. **将本地服务暴露到公网**
   - 你的网站运行在 `http://localhost:3000`（本地）
   - Ngrok 创建一个公网 URL，转发到你的本地服务
   - 其他人可以通过这个 URL 访问你的网站

2. **用于 Webhook 接收**
   - Creem 支付系统需要向你的服务器发送 webhook
   - 本地 `localhost` 无法接收外部请求
   - Ngrok 让 Creem 可以通过公网 URL 访问你的 `/api/webhook` 接口

## 如何使用 Ngrok 让别人访问你的网站

### 步骤 1: 安装 Ngrok

1. 访问 [ngrok.com](https://ngrok.com)
2. 注册账号（免费）
3. 下载 ngrok 客户端
4. 安装并配置 authtoken（在 ngrok 后台获取）

### 步骤 2: 启动你的网站

```bash
npm run dev
```

你的网站会在 `http://localhost:3000` 运行

### 步骤 3: 启动 Ngrok

打开新的终端窗口，运行：

```bash
ngrok http 3000
```

你会看到类似这样的输出：

```
Forwarding  https://suzette-schmalzier-marriedly.ngrok-free.dev -> http://localhost:3000
```

### 步骤 4: 分享 URL

现在你可以将 `https://suzette-schmalzier-marriedly.ngrok-free.dev` 这个 URL 分享给其他人，他们就可以访问你的网站了！

## Ngrok 免费版的限制

⚠️ **重要提示：** Ngrok 免费版有以下限制：

1. **URL 会变化**
   - 每次重启 ngrok，URL 都会改变
   - 如果想让 URL 固定，需要付费版

2. **访问限制**
   - 免费版有访问次数限制
   - 可能会有 ngrok 的警告页面（需要点击"Visit Site"）

3. **连接数限制**
   - 免费版同时连接数有限制

4. **带宽限制**
   - 免费版有带宽限制

## 如何配置 Webhook

如果你的网站需要接收 webhook（比如 Creem 支付），需要：

1. **在 Creem Dashboard 配置 Webhook URL**
   ```
   https://suzette-schmalzier-marriedly.ngrok-free.dev/api/webhook
   ```

2. **在 .env.local 中配置 SUCCESS_URL**
   ```env
   SUCCESS_URL=https://suzette-schmalzier-marriedly.ngrok-free.dev/account
   ```

3. **确保 ngrok 一直运行**
   - 如果 ngrok 停止，webhook 将无法接收
   - 建议使用 `screen` 或 `tmux` 保持 ngrok 在后台运行

## 生产环境部署（推荐）

如果你想让别人长期稳定地访问你的网站，建议部署到生产环境：

### 选项 1: Vercel（推荐，免费）

1. **准备代码**
   ```bash
   git add .
   git commit -m "准备部署"
   git push
   ```

2. **部署到 Vercel**
   - 访问 [vercel.com](https://vercel.com)
   - 使用 GitHub 账号登录
   - 导入你的项目
   - 配置环境变量（在 Vercel Dashboard 中）
   - 点击 Deploy

3. **获得永久 URL**
   - Vercel 会给你一个类似 `your-project.vercel.app` 的 URL
   - 这个 URL 是永久的，不会变化

4. **配置环境变量**
   在 Vercel Dashboard → Settings → Environment Variables 中添加：
   ```
   NEXT_PUBLIC_SUPABASE_URL=你的 Supabase URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY=你的 Supabase Anon Key
   SUPABASE_SERVICE_ROLE_KEY=你的 Service Role Key
   CREEM_API_KEY=你的 Creem API Key
   SUCCESS_URL=https://your-project.vercel.app/account
   SILICONFLOW_API_KEY=你的 SiliconFlow API Key
   ```

### 选项 2: 其他平台

- **Netlify**: 类似 Vercel，免费且易用
- **Railway**: 适合需要数据库的应用
- **Render**: 免费版支持 Node.js
- **自己的服务器**: 需要购买 VPS 和域名

## 本地开发 vs 生产环境

### 本地开发（使用 Ngrok）
- ✅ 适合开发和测试
- ✅ 快速迭代
- ❌ URL 会变化
- ❌ 需要保持电脑和 ngrok 运行
- ❌ 有访问限制

### 生产环境（Vercel 等）
- ✅ URL 永久固定
- ✅ 24/7 在线
- ✅ 自动 HTTPS
- ✅ 更好的性能
- ✅ 免费版足够个人项目使用

## 快速开始：部署到 Vercel

1. **安装 Vercel CLI**（可选）
   ```bash
   npm i -g vercel
   ```

2. **在项目根目录运行**
   ```bash
   vercel
   ```

3. **按照提示操作**
   - 登录 Vercel 账号
   - 选择项目设置
   - 配置环境变量
   - 等待部署完成

4. **获得生产 URL**
   - 部署完成后，你会得到一个 `*.vercel.app` 的 URL
   - 这个 URL 可以分享给任何人

## 总结

- **Ngrok**: 适合临时测试和开发，URL 会变化
- **Vercel**: 适合正式发布，URL 永久固定，免费且稳定

**建议：**
- 开发阶段：使用 ngrok 快速测试
- 正式发布：部署到 Vercel 或其他生产环境





