# 自主搜索（Bocha）配置说明

## 1. 需要配置的环境变量

在本项目中，联网搜索工具 `web_search` 使用 **博查（Bocha）Web Search**：
- Base：`https://api.bocha.cn/`
- Endpoint：`https://api.bocha.cn/v1/web-search`

请在你的环境变量中配置：

- **BOCHA_API_KEY**：你的博查 API Key（放在请求头 `Authorization`）

### 本地开发（.env.local）

在项目根目录创建或编辑 `.env.local`：

```env
BOCHA_API_KEY=你的key
```

重启 `npm run dev` 后生效。

### 线上部署（Vercel）

在 Vercel 项目的 Environment Variables 中新增：
- Key：`BOCHA_API_KEY`
- Value：你的 key

然后重新部署。

## 2. 使用方式

当你使用 **自定义智能体** 对话，并且问题涉及实时信息时，模型会优先调用：
- `web_search`：搜索结果（标题/链接/摘要）
- 必要时调用 `fetch_url`：抓取网页正文用于摘要与引用

回答会在末尾附上“来源（标题 + 链接）”，但不会显式说“我使用了工具”。

