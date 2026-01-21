# 智能体增强功能实现方案

## 一、工具调用（Tool Use）实现

### 1.1 模型支持确认
- **DeepSeek-V3.2-Exp** 支持 OpenAI 格式的 function calling
- **SiliconFlow API** 支持 `tools` 参数（与 OpenAI API 兼容）

### 1.2 实现步骤

#### 步骤1：创建工具注册系统
创建 `lib/agent-tools.ts`：
```typescript
// 定义工具接口
export interface AgentTool {
  name: string
  description: string
  parameters: {
    type: "object"
    properties: Record<string, any>
    required?: string[]
  }
  handler: (args: any) => Promise<any>
}

// 工具注册表
const registeredTools: Map<string, AgentTool> = new Map()

// 注册工具
export function registerTool(tool: AgentTool) {
  registeredTools.set(tool.name, tool)
}

// 获取所有工具（用于发送给模型）
export function getToolsForModel(): any[] {
  return Array.from(registeredTools.values()).map(tool => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }
  }))
}

// 执行工具
export async function executeTool(name: string, args: any): Promise<any> {
  const tool = registeredTools.get(name)
  if (!tool) {
    throw new Error(`Tool ${name} not found`)
  }
  return await tool.handler(args)
}
```

#### 步骤2：实现具体工具
创建 `lib/tools/health-tools.ts`：
```typescript
import { registerTool } from "@/lib/agent-tools"

// 示例：查询食物营养成分
registerTool({
  name: "search_food_nutrition",
  description: "查询食物的营养成分信息，包括卡路里、蛋白质、脂肪、碳水化合物等",
  parameters: {
    type: "object",
    properties: {
      food_name: {
        type: "string",
        description: "食物名称"
      }
    },
    required: ["food_name"]
  },
  handler: async (args: { food_name: string }) => {
    // 调用外部API或查询数据库
    // 这里可以集成第三方API，如USDA FoodData Central
    return {
      food: args.food_name,
      calories: 100,
      protein: 10,
      fat: 5,
      carbs: 15
    }
  }
})

// 示例：计算卡路里消耗
registerTool({
  name: "calculate_calories_burned",
  description: "根据运动类型、时长和体重计算卡路里消耗",
  parameters: {
    type: "object",
    properties: {
      activity: { type: "string", description: "运动类型" },
      duration_minutes: { type: "number", description: "运动时长（分钟）" },
      weight_kg: { type: "number", description: "体重（公斤）" }
    },
    required: ["activity", "duration_minutes"]
  },
  handler: async (args) => {
    // 计算逻辑
    return { calories_burned: 200 }
  }
})

// 示例：设置提醒
registerTool({
  name: "set_reminder",
  description: "为用户设置健康提醒，如喝水、运动、睡眠等",
  parameters: {
    type: "object",
    properties: {
      reminder_type: { type: "string", description: "提醒类型" },
      scheduled_time: { type: "string", description: "提醒时间（ISO格式）" },
      message: { type: "string", description: "提醒消息" }
    },
    required: ["reminder_type", "scheduled_time"]
  },
  handler: async (args) => {
    // 创建主动任务
    // 调用 /api/proactive-tasks 创建任务
    return { success: true, task_id: "..." }
  }
})
```

#### 步骤3：修改聊天API支持工具调用
修改 `app/api/chat/route.ts`：
```typescript
import { getToolsForModel, executeTool } from "@/lib/agent-tools"

export async function POST(req: Request) {
  const { messages, characterId } = await req.json()
  
  // ... 获取角色和系统提示词 ...
  
  // 获取工具列表
  const tools = getToolsForModel()
  
  // 第一次调用：发送消息和工具定义
  const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: formattedMessages,
      tools: tools.length > 0 ? tools : undefined,  // 如果有工具则传入
      tool_choice: "auto",  // 让模型决定是否调用工具
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    }),
  })
  
  // 处理流式响应，检查是否有 tool_calls
  // 如果模型返回 tool_calls，需要：
  // 1. 执行工具
  // 2. 将工具结果添加到消息中
  // 3. 再次调用模型获取最终回复
}
```

### 1.3 工具调用流程
```
用户消息 → 模型（带工具定义）→ 模型决定调用工具 → 执行工具 → 
工具结果 → 模型（带工具结果）→ 最终回复
```

---

## 二、记忆系统（Memory）实现

### 2.1 实现步骤

#### 步骤1：创建记忆管理模块
创建 `lib/agent-memory.ts`：
```typescript
import { createClient } from "@/lib/supabase/server"

// 获取用户偏好
export async function getUserPreferences(
  userId: string,
  agentId?: string
): Promise<Record<string, any>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .eq(agentId ? "agent_id" : "agent_id", agentId || null)
  
  const preferences: Record<string, any> = {}
  data?.forEach(item => {
    preferences[item.key] = JSON.parse(item.value || "{}")
  })
  return preferences
}

// 保存用户偏好
export async function saveUserPreference(
  userId: string,
  key: string,
  value: any,
  agentId?: string,
  category?: string
) {
  const supabase = await createClient()
  await supabase
    .from("user_preferences")
    .upsert({
      user_id: userId,
      agent_id: agentId || null,
      key,
      value: JSON.stringify(value),
      category,
      updated_at: new Date().toISOString()
    })
}

// 获取对话记忆
export async function getConversationMemories(
  userId: string,
  agentId?: string,
  limit: number = 10
): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("conversation_memories")
    .select("content")
    .eq("user_id", userId)
    .eq(agentId ? "agent_id" : "agent_id", agentId || null)
    .order("importance", { ascending: false })
    .order("last_accessed_at", { ascending: false })
    .limit(limit)
  
  return data?.map(m => m.content) || []
}

// 保存对话记忆
export async function saveConversationMemory(
  userId: string,
  content: string,
  memoryType: string,
  agentId?: string,
  importance: number = 5,
  tags?: string[]
) {
  const supabase = await createClient()
  await supabase
    .from("conversation_memories")
    .insert({
      user_id: userId,
      agent_id: agentId || null,
      memory_type: memoryType,
      content,
      importance,
      tags: tags || [],
      last_accessed_at: new Date().toISOString()
    })
}
```

#### 步骤2：在聊天API中注入记忆
修改 `app/api/chat/route.ts`：
```typescript
import { getUserPreferences, getConversationMemories } from "@/lib/agent-memory"

export async function POST(req: Request) {
  const { messages, characterId, userId } = await req.json()
  
  // 获取用户偏好和记忆
  const preferences = userId ? await getUserPreferences(userId, characterId) : {}
  const memories = userId ? await getConversationMemories(userId, characterId) : []
  
  // 构建记忆上下文
  const memoryContext = `
用户偏好：
${Object.entries(preferences).map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`).join('\n')}

重要记忆：
${memories.map(m => `- ${m}`).join('\n')}
`
  
  // 将记忆注入系统提示词
  const enhancedSystemPrompt = `${systemPrompt}\n\n${memoryContext}`
  
  // ... 继续处理消息 ...
}
```

---

## 三、主动能力（Proactive Actions）实现

### 3.1 实现步骤

#### 步骤1：创建定时任务API
创建 `app/api/cron/proactive-tasks/route.ts`：
```typescript
import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// 这个API可以被Vercel Cron或外部定时服务调用
export async function GET(request: Request) {
  // 验证请求来源（防止未授权调用）
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const supabase = await createClient()
  
  // 查找所有待执行的任务
  const now = new Date().toISOString()
  const { data: tasks } = await supabase
    .from("proactive_tasks")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", now)
    .limit(100)
  
  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ message: "No tasks to execute" })
  }
  
  // 执行任务
  for (const task of tasks) {
    try {
      await executeProactiveTask(task)
      
      // 更新任务状态
      await supabase
        .from("proactive_tasks")
        .update({
          status: "executed",
          executed_at: new Date().toISOString(),
          result: { success: true }
        })
        .eq("id", task.id)
    } catch (error) {
      // 标记失败
      await supabase
        .from("proactive_tasks")
        .update({
          status: "failed",
          executed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : String(error)
        })
        .eq("id", task.id)
    }
  }
  
  return NextResponse.json({ executed: tasks.length })
}

async function executeProactiveTask(task: any) {
  const { task_type, task_data, user_id, agent_id } = task
  
  switch (task_type) {
    case "reminder":
      // 发送提醒（可以通过推送通知、邮件等）
      await sendReminder(user_id, task_data)
      break
    case "follow_up":
      // 跟进用户进度
      await sendFollowUp(user_id, agent_id, task_data)
      break
    case "progress_check":
      // 检查用户目标进度
      await checkProgress(user_id, agent_id)
      break
  }
}
```

#### 步骤2：配置Vercel Cron（或使用其他定时服务）
创建 `vercel.json`：
```json
{
  "crons": [{
    "path": "/api/cron/proactive-tasks",
    "schedule": "*/5 * * * *"
  }]
}
```

#### 步骤3：创建主动任务API
创建 `app/api/proactive-tasks/route.ts`：
```typescript
// POST: 创建主动任务
// GET: 获取用户的任务列表
// DELETE: 删除任务
```

---

## 四、实施优先级

### 阶段1：基础功能（1-2周）
1. ✅ 创建数据库表
2. ✅ 实现记忆系统（用户偏好存储和加载）
3. ✅ 修改聊天API注入记忆上下文

### 阶段2：工具调用（2-3周）
1. ✅ 创建工具注册系统
2. ✅ 实现3-5个基础工具（食物查询、卡路里计算、提醒设置）
3. ✅ 修改聊天API支持function calling
4. ✅ 测试工具调用流程

### 阶段3：主动能力（2-3周）
1. ✅ 创建主动任务系统
2. ✅ 实现定时任务执行
3. ✅ 实现提醒功能
4. ✅ 实现进度追踪

### 阶段4：优化和扩展（1-2周）
1. ✅ 性能优化
2. ✅ 错误处理完善
3. ✅ 添加更多工具
4. ✅ UI界面优化

---

## 五、注意事项

1. **工具调用成本**：每次工具调用会增加API调用次数，注意成本控制
2. **记忆管理**：记忆过多会影响上下文长度，需要实现记忆重要性评分和清理机制
3. **定时任务**：需要确保定时任务服务稳定运行
4. **安全性**：工具调用需要验证参数，防止注入攻击
5. **用户体验**：工具调用会增加响应时间，需要优化用户体验

---

## 六、总结

通过以上实现，你的智能体将具备：
- ✅ **工具调用能力**：可以调用外部API和内部功能
- ✅ **长期记忆系统**：记住用户偏好和重要信息
- ✅ **主动能力**：可以主动提醒和跟进用户

这将大大提升智能体的实用性和用户体验！
