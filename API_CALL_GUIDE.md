# API 调用指南

本文档详细说明如何调用项目中的所有 API 端点。

## 基础信息

- **基础 URL**: `http://localhost:3000` (本地开发) 或 `https://your-domain.com` (生产环境)
- **所有 API 都使用 POST 方法**（除了 `/api/checkout` 使用 GET）
- **Content-Type**: `application/json`

---

## 1. 普通聊天 API (`/api/chat`)

### 功能
与单个 AI 角色进行对话，支持流式响应。

### 请求格式

**curl 示例：**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "你好"
      }
    ],
    "characterId": "acheng"
  }'
```

**JavaScript fetch 示例：**
```javascript
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      {
        role: 'user',
        content: '你好'
      }
    ],
    characterId: 'acheng'  // 可选，不提供则使用默认角色
  })
})

// 处理流式响应
const reader = response.body.getReader()
const decoder = new TextDecoder()
let accumulatedContent = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  const chunk = decoder.decode(value)
  accumulatedContent += chunk
  console.log('收到内容:', chunk)
}

console.log('完整回复:', accumulatedContent)
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | Array | 是 | 消息历史数组，格式：`[{role: "user"|"assistant", content: "..."}]` |
| `characterId` | String | 否 | 角色ID，可选值：`acheng`、`yage`、`tongtong`、`xinxin` |

### 响应格式

**流式响应**（Server-Sent Events）：
- Content-Type: `text/plain; charset=utf-8`
- 返回的是纯文本流，逐字符/逐词返回
- 示例：`"你好"` → `"你"` → `"好"` → `"！"` → ...

**错误响应**（JSON）：
```json
{
  "error": "错误信息"
}
```

### 可用角色ID

- `acheng` - 阿城（温暖）
- `yage` - 亚戈（热情）
- `tongtong` - 童童（腼腆）
- `xinxin` - 欣欣（理性知心）

---

## 2. 聊天室 API (`/api/chat-room`)

### 功能
多个 AI 角色同时参与对话，每个角色都会回应。

### 请求格式

**curl 示例：**
```bash
curl -X POST http://localhost:3000/api/chat-room \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "大家好"
      }
    ],
    "invitedCharacters": ["acheng", "yage", "xinxin", "tongtong"]
  }'
```

**JavaScript fetch 示例：**
```javascript
const response = await fetch('/api/chat-room', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messages: [
      {
        role: 'user',
        content: '大家好'
      }
    ],
    invitedCharacters: ['acheng', 'yage', 'xinxin', 'tongtong']
  })
})

// 处理流式响应（包含多个角色的回应）
const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''
let currentCharacterId = ''
let currentCharacterName = ''
let accumulatedContent = {}

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  
  buffer += decoder.decode(value, { stream: true })
  
  // 查找 CHARACTER: 标记
  const characterIndex = buffer.indexOf('CHARACTER:')
  if (characterIndex !== -1) {
    const charEndIndex = buffer.indexOf('\n', characterIndex)
    if (charEndIndex !== -1) {
      const charLine = buffer.substring(characterIndex, charEndIndex)
      const match = charLine.match(/CHARACTER:([^|]+)\|([^|]+)\|/)
      if (match) {
        currentCharacterId = match[1]
        currentCharacterName = match[2]
        accumulatedContent[currentCharacterId] = ''
        buffer = buffer.substring(charEndIndex + 1)
      }
    }
  }
  
  // 累积当前角色的内容
  if (currentCharacterId) {
    const nextCharIndex = buffer.indexOf('CHARACTER:')
    if (nextCharIndex !== -1) {
      accumulatedContent[currentCharacterId] += buffer.substring(0, nextCharIndex)
      buffer = buffer.substring(nextCharIndex)
    } else {
      accumulatedContent[currentCharacterId] += buffer
      buffer = ''
    }
  }
}

console.log('所有角色回复:', accumulatedContent)
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | Array | 是 | 消息历史数组，可以包含 `characterId` 和 `characterName` 字段来标识不同角色的发言 |
| `invitedCharacters` | Array | 是 | 邀请的角色ID数组，至少包含一个角色 |

### 响应格式

**流式响应**（特殊格式）：
```
CHARACTER:acheng|阿城|
你好呀~我是阿城...

CHARACTER:yage|亚戈|
哈喽！我是亚戈...

CHARACTER:xinxin|欣欣|
大家好，我是欣欣...

CHARACTER:tongtong|童童|
（轻声）大、大家好...
```

- 每个角色回应前会先发送 `CHARACTER:{id}|{name}|\n`
- 然后是角色的回复内容
- 最后是 `\n\n` 分隔符

---

## 3. 文本转语音 API (`/api/tts`)

### 功能
将文本转换为语音（MP3 格式），使用指定角色的声音。

### 请求格式

**curl 示例：**
```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，我是阿城",
    "characterId": "acheng"
  }' \
  --output audio.mp3
```

**JavaScript fetch 示例：**
```javascript
const response = await fetch('/api/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: '你好，我是阿城',
    characterId: 'acheng'  // 可选，不提供则使用默认角色
  })
})

if (response.ok) {
  const audioBlob = await response.blob()
  const audioUrl = URL.createObjectURL(audioBlob)
  
  // 播放音频
  const audio = new Audio(audioUrl)
  audio.play()
  
  // 或下载
  const link = document.createElement('a')
  link.href = audioUrl
  link.download = 'audio.mp3'
  link.click()
}
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | String | 是 | 要转换的文本内容 |
| `characterId` | String | 否 | 角色ID，用于选择对应的声音 |

### 响应格式

- **成功**: 返回 MP3 音频文件的二进制数据
- Content-Type: `audio/mpeg`
- **错误**: JSON 格式
```json
{
  "error": "错误信息"
}
```

### 角色声音映射

- `acheng` → `fnlp/MOSS-TTSD-v0.5:benjamin` (男声)
- `yage` → `fnlp/MOSS-TTSD-v0.5:alex` (男声)
- `tongtong` → `fnlp/MOSS-TTSD-v0.5:diana` (女声)
- `xinxin` → `fnlp/MOSS-TTSD-v0.5:bella` (女声)

---

## 4. 创建支付会话 API (`/api/checkout`)

### 功能
创建 Creem 支付链接，需要用户登录。

### 请求格式

**curl 示例：**
```bash
# 需要先登录获取 session cookie
curl -X GET "http://localhost:3000/api/checkout?product_id=prod_xxx" \
  -H "Cookie: your-session-cookie"
```

**JavaScript fetch 示例：**
```javascript
// 需要用户已登录（通过 Supabase Auth）
const response = await fetch('/api/checkout?product_id=prod_xxx', {
  method: 'GET',
  credentials: 'include'  // 包含 cookies
})

const data = await response.json()
if (data.success) {
  // 跳转到支付页面
  window.location.href = data.checkoutUrl
}
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `product_id` | String (Query) | 是 | Creem 产品ID |

### 响应格式

**成功响应：**
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.creem.com/xxx"
}
```

**错误响应：**
```json
{
  "error": "错误信息",
  "details": "详细错误信息"
}
```

---

## 5. Webhook API (`/api/webhook`)

### 功能
接收 Creem 支付平台的 webhook 通知，更新数据库。

### 请求格式

**Creem 会自动调用此端点**，但你可以手动测试：

**curl 测试示例：**
```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "id": "webhook_123",
    "eventType": "checkout.completed",
    "object": {
      "request_id": "user-uuid-here",
      "object": "checkout",
      "id": "order_123",
      "customer": {
        "id": "customer_123"
      },
      "product": {
        "id": "prod_xxx",
        "billing_type": "one_time"
      },
      "status": "completed",
      "metadata": {
        "userId": "user-uuid-here"
      }
    }
  }'
```

### 支持的事件类型

**一次性支付：**
- `checkout.completed`
- `payment.completed`
- `purchase.completed`

**订阅支付：**
- `subscription.active`
- `subscription.paid`
- `subscription.update`
- `subscription.canceled`
- `subscription.expired`

---

## 完整示例：前端聊天应用

```javascript
// 完整的聊天功能实现
class ChatClient {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
    this.messages = []
    this.characterId = 'acheng'
  }

  // 发送消息（普通聊天）
  async sendMessage(content) {
    const userMessage = {
      role: 'user',
      content: content
    }
    
    this.messages.push(userMessage)
    
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: this.messages,
        characterId: this.characterId
      })
    })

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`)
    }

    // 处理流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let assistantContent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      assistantContent += chunk
      
      // 实时更新 UI
      this.onMessageUpdate(assistantContent)
    }

    // 保存完整消息
    this.messages.push({
      role: 'assistant',
      content: assistantContent
    })

    return assistantContent
  }

  // 发送消息（聊天室）
  async sendChatRoomMessage(content, invitedCharacters) {
    const userMessage = {
      role: 'user',
      content: content
    }
    
    this.messages.push(userMessage)
    
    const response = await fetch(`${this.baseUrl}/api/chat-room`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: this.messages,
        invitedCharacters: invitedCharacters
      })
    })

    if (!response.ok) {
      throw new Error(`API 错误: ${response.status}`)
    }

    // 处理多角色流式响应
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let currentCharacterId = ''
    let currentCharacterName = ''
    let characterMessages = {}

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      
      // 解析 CHARACTER: 标记
      const charIndex = buffer.indexOf('CHARACTER:')
      if (charIndex !== -1) {
        const charEndIndex = buffer.indexOf('\n', charIndex)
        if (charEndIndex !== -1) {
          const charLine = buffer.substring(charIndex, charEndIndex)
          const match = charLine.match(/CHARACTER:([^|]+)\|([^|]+)\|/)
          if (match) {
            // 保存上一个角色的消息
            if (currentCharacterId && characterMessages[currentCharacterId]) {
              this.messages.push({
                role: 'assistant',
                content: characterMessages[currentCharacterId],
                characterId: currentCharacterId,
                characterName: currentCharacterName
              })
            }
            
            currentCharacterId = match[1]
            currentCharacterName = match[2]
            characterMessages[currentCharacterId] = ''
            buffer = buffer.substring(charEndIndex + 1)
          }
        }
      }
      
      // 累积内容
      if (currentCharacterId) {
        const nextCharIndex = buffer.indexOf('CHARACTER:')
        if (nextCharIndex !== -1) {
          characterMessages[currentCharacterId] += buffer.substring(0, nextCharIndex)
          buffer = buffer.substring(nextCharIndex)
        } else {
          characterMessages[currentCharacterId] += buffer
          buffer = ''
        }
        
        // 实时更新 UI
        this.onChatRoomUpdate(currentCharacterId, currentCharacterName, characterMessages[currentCharacterId])
      }
    }

    // 保存最后一个角色的消息
    if (currentCharacterId && characterMessages[currentCharacterId]) {
      this.messages.push({
        role: 'assistant',
        content: characterMessages[currentCharacterId],
        characterId: currentCharacterId,
        characterName: currentCharacterName
      })
    }

    return characterMessages
  }

  // 文本转语音
  async textToSpeech(text, characterId = null) {
    const response = await fetch(`${this.baseUrl}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        characterId: characterId || this.characterId
      })
    })

    if (!response.ok) {
      throw new Error(`TTS API 错误: ${response.status}`)
    }

    const audioBlob = await response.blob()
    return URL.createObjectURL(audioBlob)
  }

  // UI 更新回调（需要实现）
  onMessageUpdate(content) {
    console.log('消息更新:', content)
  }

  onChatRoomUpdate(characterId, characterName, content) {
    console.log(`${characterName} 说:`, content)
  }
}

// 使用示例
const chat = new ChatClient()

// 普通聊天
await chat.sendMessage('你好')

// 聊天室
await chat.sendChatRoomMessage('大家好', ['acheng', 'yage', 'xinxin'])

// 文本转语音
const audioUrl = await chat.textToSpeech('你好，我是阿城')
const audio = new Audio(audioUrl)
audio.play()
```

---

## 错误处理

所有 API 在出错时都会返回 JSON 格式的错误信息：

```json
{
  "error": "错误描述"
}
```

常见错误码：
- `400` - 请求参数错误
- `401` - 未授权（需要登录）
- `500` - 服务器内部错误

---

## 注意事项

1. **流式响应**：`/api/chat` 和 `/api/chat-room` 返回的是流式数据，需要使用 `ReadableStream` 处理
2. **认证**：`/api/checkout` 需要用户登录，需要携带 session cookie
3. **角色ID**：确保使用正确的角色ID（`acheng`、`yage`、`tongtong`、`xinxin`）
4. **环境变量**：确保服务器配置了 `SILICONFLOW_API_KEY` 和 `CREEM_API_KEY`

---

## 测试命令

### 测试普通聊天
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"characterId":"acheng"}' \
  --no-buffer
```

### 测试文本转语音
```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"你好，我是阿城","characterId":"acheng"}' \
  --output test.mp3
```

### 测试聊天室
```bash
curl -X POST http://localhost:3000/api/chat-room \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"大家好"}],"invitedCharacters":["acheng","yage"]}' \
  --no-buffer
```

