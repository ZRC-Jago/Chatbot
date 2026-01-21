export const runtime = "nodejs"

import dns from "node:dns"
import { getSystemPrompt } from "@/lib/system-prompt"
import { getCharacterById, getDefaultCharacter, getCharacterByIdAsync, convertAgentToCharacter } from "@/lib/characters"
import { CHAT_MODEL } from "@/lib/models"
import { createClient } from "@/lib/supabase/server"
import { executeTool, getToolsForModel } from "@/lib/agent-tools"

// 在 Windows / 某些网络环境下，Node 可能优先解析 IPv6 导致 fetch failed；强制 IPv4 优先
try {
  dns.setDefaultResultOrder("ipv4first")
} catch {
  // ignore
}

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY
const SILICONFLOW_CHAT_URL = "https://api.siliconflow.cn/v1/chat/completions"

if (!SILICONFLOW_API_KEY) {
  console.error("[v0] SILICONFLOW_API_KEY 环境变量未配置")
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts?: { retries?: number; timeoutMs?: number; baseDelayMs?: number }
): Promise<Response> {
  // 增加默认重试次数，因为连接超时（10秒）经常发生
  const retries = opts?.retries ?? 4  // 从2增加到4，总共尝试5次
  const timeoutMs = opts?.timeoutMs ?? 60000
  const baseDelayMs = opts?.baseDelayMs ?? 2000  // 从600ms增加到2000ms，给网络更多恢复时间

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, { ...init, signal: controller.signal })
      clearTimeout(timeout)
      // 如果成功，但响应状态码是429（限流）或503（服务不可用），也考虑重试
      if (res.status === 429 || res.status === 503) {
        const isLast = attempt === retries
        if (!isLast) {
          clearTimeout(timeout)
          const delay = baseDelayMs * Math.max(1, attempt + 1)
          console.warn(`[v0] SiliconFlow API 返回 ${res.status}，等待 ${delay}ms 后重试...`)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
      }
      return res
    } catch (err) {
      clearTimeout(timeout)
      lastError = err
      const isLast = attempt === retries
      // 连接超时错误（ConnectTimeoutError）使用更长的延迟
      const isConnectTimeout = (err as any)?.cause?.code === "UND_ERR_CONNECT_TIMEOUT" || 
                               (err as any)?.message?.includes("Connect Timeout") ||
                               (err as any)?.name === "AbortError"
      const delay = isConnectTimeout 
        ? baseDelayMs * (attempt + 1) * 1.5  // 连接超时时延迟更长
        : baseDelayMs * Math.max(1, attempt + 1)
      
      console.error("[v0] SiliconFlow fetch failed", {
        attempt: attempt + 1,
        retries: retries + 1,
        name: (err as any)?.name,
        message: (err as any)?.message,
        cause: (err as any)?.cause,
        isConnectTimeout,
        willRetry: !isLast,
        nextDelayMs: !isLast ? Math.round(delay) : 0,
      })
      if (!isLast) {
        await new Promise((r) => setTimeout(r, delay))
        continue
      }
    }
  }
  throw lastError
}

type OpenAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: any[] }
  | { role: "tool"; tool_call_id: string; content: string }

function sanitizeAssistantText(text: string): string {
  if (!text) return text
  // 过滤 DeepSeek/部分模型可能输出的 DSML 工具调用块，避免污染用户可见内容
  let out = text
  // 半角版本：<|DSML|...>
  out = out.replace(/<\|DSML\|function_calls>[\s\S]*?<\/\|DSML\|function_calls>/g, "")
  out = out.replace(/<\|DSML\|invoke[\s\S]*?<\/\|DSML\|invoke>/g, "")
  out = out.replace(/^\s*<\|DSML\|.*>\s*$/gm, "")
  // 全角版本：<｜DSML｜...>
  out = out.replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, "")
  out = out.replace(/<｜DSML｜invoke[\s\S]*?<\/｜DSML｜invoke>/g, "")
  out = out.replace(/^\s*<｜DSML｜.*>\s*$/gm, "")
  
  // 修复链接格式：确保每个链接单独一行
  // 检测同一行包含多个 URL 的情况，自动拆分
  const lines = out.split('\n')
  const fixedLines: string[] = []
  
  for (const line of lines) {
    // 检查是否包含多个 URL（在同一行）
    const urls = line.match(/https?:\/\/[^\s\)\n]+/g)
    if (urls && urls.length > 1) {
      // 同一行有多个链接，需要拆分
      // 方法：按数字编号模式拆分（例如：1. 标题 https://... 2. 标题 https://...）
      // 匹配模式：数字 + 点 + 空格 + 可选粗体/普通文本 + 冒号/空格 + URL
      const linkPattern = /(\d+\.\s+(?:\*\*[^*]+\*\*|[\w\s\-]+)?[\s:]+)(https?:\/\/[^\s\)\n]+)/g
      const matches: Array<{ index: number; text: string; url: string; full: string }> = []
      let match
      
      while ((match = linkPattern.exec(line)) !== null) {
        matches.push({
          index: match.index,
          text: match[1],
          url: match[2],
          full: match[0],
        })
      }
      
      if (matches.length > 0) {
        // 找到所有匹配，按位置拆分
        let lastPos = 0
        for (const m of matches) {
          if (m.index > lastPos) {
            const before = line.substring(lastPos, m.index).trim()
            if (before) fixedLines.push(before)
          }
          fixedLines.push(m.text + m.url)
          lastPos = m.index + m.full.length
        }
        // 添加剩余部分
        if (lastPos < line.length) {
          const remaining = line.substring(lastPos).trim()
          if (remaining) fixedLines.push(remaining)
        }
      } else {
        // 没有匹配到编号模式，尝试简单按 URL 拆分
        let lastPos = 0
        const parts: string[] = []
        for (const url of urls) {
          const urlIndex = line.indexOf(url, lastPos)
          if (urlIndex >= 0) {
            if (urlIndex > lastPos) {
              const part = line.substring(lastPos, urlIndex + url.length).trim()
              if (part) parts.push(part)
            } else {
              parts.push(url)
            }
            lastPos = urlIndex + url.length
          }
        }
        if (parts.length > 1) {
          fixedLines.push(...parts)
        } else {
          fixedLines.push(line)
        }
      }
    } else {
      fixedLines.push(line)
    }
  }
  
  return fixedLines.join('\n').trim()
}

export async function POST(req: Request) {
  const { messages, characterId, userId } = await req.json()

  console.log("[v0] Received messages:", messages)
  console.log("[v0] Character ID:", characterId)
  console.log("[v0] User ID:", userId)
  console.log("[v0] SILICONFLOW_API_KEY exists:", !!SILICONFLOW_API_KEY)

  // 获取角色配置
  let character = characterId ? getCharacterById(characterId) : null
  
  // 如果不是系统角色，尝试从数据库加载自定义智能体
  if (!character && characterId && userId) {
    try {
      const supabase = await createClient()
      const { data: agent, error } = await supabase
        .from("custom_agents")
        .select("*")
        .eq("id", characterId)
        .single()
      
      if (!error && agent) {
        character = convertAgentToCharacter(agent)
        console.log("[v0] 加载自定义智能体:", character.name)
      }
    } catch (error) {
      console.error("[v0] 加载自定义智能体失败:", error)
    }
  }
  
  // 如果还是找不到，使用默认角色
  if (!character) {
    character = getDefaultCharacter()
  }
  
  const systemPrompt = getSystemPrompt(character)
  console.log("[v0] Using character:", character.name, "isCustom:", character.isCustom)

  // Prepare messages with system prompt
  const formattedMessages: OpenAIMessage[] = [
    { role: "system", content: systemPrompt },
    ...(Array.isArray(messages) ? messages : []).map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
  ] as any

  // 提取最后一条用户消息（用于判断是否需要主动检索）
  const lastUserMsg = [...(Array.isArray(messages) ? messages : [])]
    .reverse()
    .find((m: any) => m?.role === "user" && typeof m?.content === "string")?.content as string | undefined

  const needSources =
    typeof lastUserMsg === "string" &&
    /来源|链接|引用|权威|指南|文献|证据|出处/.test(lastUserMsg)

  // 检查 API Key 是否配置
  if (!SILICONFLOW_API_KEY) {
    console.error("[v0] SILICONFLOW_API_KEY 未配置")
    return new Response(
      JSON.stringify({ 
        error: "SiliconFlow API Key 未配置。请在 .env.local 文件中添加 SILICONFLOW_API_KEY=你的API密钥" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    // 只有自定义智能体才启用工具调用
    const enableTools = character.isCustom === true
    const tools = enableTools ? getToolsForModel() : []
    
    if (enableTools) {
      console.log("[v0] 准备调用 SiliconFlow API（工具调用开启）...")
      console.log("[v0] 可用工具数量:", tools.length, "工具列表:", tools.map(t => t.function.name))
      console.log("[v0] BOCHA env exists:", !!(process.env.BOCHA_API_KEY || process.env.BOCHA_KEY || process.env.BOCHA_APIKEY))
    } else {
      console.log("[v0] 准备调用 SiliconFlow API（工具调用关闭 - 普通陪伴角色）...")
    }
    console.log("[v0] Model:", CHAT_MODEL)
    console.log("[v0] Messages count:", formattedMessages.length)

    // 构建请求体，只有自定义智能体才包含 tools 参数
    const requestBody: any = {
      model: CHAT_MODEL,
      messages: formattedMessages,
      stream: false,
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.7,
    }

    // 如果用户明确要求“来源/链接/权威指南”，先在服务端主动检索一次，减少模型“忘记搜”的概率
    // 注意：这里不走 tool_calls 协议，直接把搜索结果作为额外 system context 提供给模型
    let preSearchResults: any | null = null
    if (enableTools && needSources) {
      try {
        const q = String(lastUserMsg || "").slice(0, 200)
        preSearchResults = await executeTool("web_search", {
          query: q,
          num_results: 8,
          freshness: "oneYear",
          summary: true,
          language: "zh",
        })
        const packed = JSON.stringify(preSearchResults).slice(0, 6000)
        requestBody.messages = [
          ...formattedMessages,
          {
            role: "system",
            content:
              "以下是联网搜索结果（JSON）。请优先基于这些结果回答，并在末尾给出“来源（标题+链接）”。\nSEARCH_RESULTS=" +
              packed,
          },
        ]
        console.log("[v0] pre-search injected:", { results: preSearchResults?.results?.length ?? 0 })
      } catch (e) {
        console.warn("[v0] pre-search failed (non-fatal):", (e as any)?.message || e)
      }
    }
    
    // 只有自定义智能体才添加 tools 和 tool_choice
    if (enableTools && tools.length > 0) {
      requestBody.tools = tools
      requestBody.tool_choice = "auto"
    }

    // 第一次调用：让模型决定是否需要调用工具（仅自定义智能体）
    const api1StartTime = Date.now()
    console.log("[v0] [时间戳] 开始第一次API调用:", new Date().toISOString())
    const response1 = await fetchWithRetry(
      SILICONFLOW_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      },
      { retries: 4, timeoutMs: 90000, baseDelayMs: 2000 }
    )
    const api1Time = Date.now() - api1StartTime
    console.log("[v0] SiliconFlow API response1 status:", response1.status, "耗时:", api1Time, "ms")

    if (!response1.ok) {
      const errorText = await response1.text()
      console.error("[v0] SiliconFlow API error response:", errorText)
      console.error("[v0] SiliconFlow API error status:", response1.status)
      let errorMessage = `SiliconFlow API 错误: ${response1.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) errorMessage = errorJson.error.message
      } catch {
        errorMessage = errorText || errorMessage
      }
      if (response1.status === 401) {
        errorMessage = "SiliconFlow API Key 无效或已过期。请检查 .env.local 文件中的 SILICONFLOW_API_KEY 配置。"
      }
      throw new Error(errorMessage)
    }

    const data1 = await response1.json()
    const message1 = data1?.choices?.[0]?.message
    const toolCalls = message1?.tool_calls

    // 普通陪伴角色或不需要工具：直接返回一次性文本（前端仍然用流式读取，单 chunk 也可工作）
    if (!enableTools || !toolCalls || toolCalls.length === 0) {
      const content = sanitizeAssistantText(message1?.content || "")
      return new Response(content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }

    console.log("[v0] tool_calls detected:", toolCalls.map((c: any) => c?.function?.name))
    console.log("[v0] 开始执行工具，工具数量:", toolCalls.length)

    // 追加 assistant tool_calls 消息
    const messagesWithTools: OpenAIMessage[] = [
      ...formattedMessages,
      { role: "assistant", content: null, tool_calls: toolCalls },
    ]

    // 执行工具并追加 tool 消息
    const toolStartTime = Date.now()
    const executedTools: Array<{ name: string; ok: boolean; result: any }> = []
    for (const call of toolCalls) {
      const toolName = call?.function?.name
      const toolCallId = call?.id
      const rawArgs = call?.function?.arguments
      if (!toolName || !toolCallId) {
        console.warn("[v0] 跳过无效的工具调用:", { toolName, toolCallId })
        continue
      }

      console.log("[v0] 执行工具:", toolName, "参数:", rawArgs)

      let parsedArgs: any = {}
      try {
        parsedArgs = rawArgs ? JSON.parse(rawArgs) : {}
      } catch (parseError) {
        console.error("[v0] tool args JSON parse error:", { toolName, rawArgs, error: parseError })
        parsedArgs = { _raw: rawArgs }
      }

      const toolExecStart = Date.now()
      try {
        const toolResult = await executeTool(toolName, parsedArgs)
        const toolExecTime = Date.now() - toolExecStart
        console.log("[v0] 工具执行成功:", toolName, "耗时:", toolExecTime, "ms")
        messagesWithTools.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify(toolResult),
        })
        executedTools.push({ name: toolName, ok: true, result: toolResult })
      } catch (toolError) {
        const toolExecTime = Date.now() - toolExecStart
        console.error("[v0] tool execution error:", {
          toolName,
          toolCallId,
          message: (toolError as any)?.message,
          execTime: toolExecTime + "ms",
        })
        // 把错误也作为 tool message 返回给模型，让模型能解释原因并继续对话
        messagesWithTools.push({
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({
            error: (toolError as any)?.message || "工具执行失败",
            tool: toolName,
          }),
        })
        executedTools.push({
          name: toolName,
          ok: false,
          result: { error: (toolError as any)?.message || "工具执行失败" },
        })
      }
    }
    const toolTotalTime = Date.now() - toolStartTime
    console.log("[v0] 所有工具执行完成，总耗时:", toolTotalTime, "ms")

    // 第二次调用：带着工具结果生成最终回复
    console.log("[v0] [时间戳] 开始第二次API调用:", new Date().toISOString(), "消息数:", messagesWithTools.length)
    const response2StartTime = Date.now()
    const response2 = await fetchWithRetry(
      SILICONFLOW_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: messagesWithTools,
          tools,
          // 第二轮的目标是“生成最终回复”，避免模型继续返回 tool_calls 导致 content 为空
          tool_choice: "none",
          stream: false,
          max_tokens: 4096,
          temperature: 0.7,
          top_p: 0.7,
        }),
      },
      { retries: 4, timeoutMs: 90000, baseDelayMs: 2000 }
    )

    const response2Time = Date.now() - response2StartTime
    console.log("[v0] SiliconFlow API response2 status:", response2.status, "耗时:", response2Time, "ms")

    if (!response2.ok) {
      const errorText = await response2.text()
      console.error("[v0] SiliconFlow API error response2:", errorText)
      throw new Error(errorText || `SiliconFlow API 错误: ${response2.status}`)
    }

    const data2 = await response2.json()
    const msg2 = data2?.choices?.[0]?.message
    const content2 = sanitizeAssistantText(msg2?.content || "")

    // 兜底：极少数情况下上游会返回空白内容（甚至只返回换行）
    if (!String(content2).trim()) {
      console.warn("[v0] 第二次调用返回空内容，使用兜底回复", {
        hasToolCalls: Array.isArray(msg2?.tool_calls) ? msg2.tool_calls.length : 0,
      })
      // 若我们已经有预检索结果或工具执行结果，尽量给用户可用输出
      const sources = (preSearchResults?.results || [])
        .slice(0, 5)
        .map((r: any) => `- ${r?.title || r?.name || "来源"}：${r?.link || r?.url || ""}`)
        .join("\n")

      // 尝试从工具执行结果中提取有用信息
      const toolInfo = executedTools
        .filter((t) => t.ok && t.result)
        .map((t) => {
          if (t.name === "web_search" && t.result?.results) {
            return t.result.results.slice(0, 3).map((r: any) => `${r.title || ""}：${r.link || ""}`).join("\n")
          }
          return null
        })
        .filter(Boolean)
        .join("\n")

      let fallback = "抱歉，模型本次未返回有效文本内容，可能是上游网络抖动或超时导致。\n\n"
      
      if (needSources && sources) {
        fallback += "以下是可用的检索来源（你可以直接点开）：\n" + sources + "\n\n"
      } else if (toolInfo) {
        fallback += "以下是工具返回的信息：\n" + toolInfo + "\n\n"
      }
      
      fallback += "建议：\n" +
        "1) 点击重新发送/重试（通常第二次就能正常出答案）\n" +
        "2) 把问题拆成 1-2 个点（例如先问热量缺口，再问蛋白质范围）\n"
      
      if (needSources) {
        fallback += "3) 如果你需要引用来源链接，请在问题里明确写请给来源链接。\n"
      }

      // 确保返回的内容不为空
      const finalFallback = fallback.trim() || "抱歉，暂时无法生成回答，请稍后重试。"
      return new Response(finalFallback, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      })
    }

    // 确保返回的内容不为空（双重检查）
    const finalContent = content2.trim() || "抱歉，暂时无法生成回答，请稍后重试。"
    return new Response(finalContent, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    })
  } catch (error) {
    console.error("[v0] Chat API error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch response from AI"
    console.error("[v0] Error message:", errorMessage)
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    // 这里大多数是上游（SiliconFlow）网络问题，使用 502 更准确
    return new Response(
      JSON.stringify({
        error: errorMessage,
        hint:
          "服务端无法连接 SiliconFlow（常见原因：网络/代理/DNS/SSL/偶发抖动）。可尝试重试，或检查是否能在本机访问 api.siliconflow.cn，以及 Node 是否走了系统代理。",
        details: {
          name: (error as any)?.name,
          message: (error as any)?.message,
          cause: (error as any)?.cause,
        },
      }),
      {
      status: 502,
      headers: { "Content-Type": "application/json" },
      }
    )
  }
}
