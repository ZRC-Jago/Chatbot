import { getSystemPrompt } from "@/lib/system-prompt"
import { getCharacterById, getDefaultCharacter } from "@/lib/characters"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.error("[v0] SILICONFLOW_API_KEY 环境变量未配置")
}

export async function POST(req: Request) {
  const { messages, characterId } = await req.json()

  console.log("[v0] Received messages:", messages)
  console.log("[v0] Character ID:", characterId)
  console.log("[v0] SILICONFLOW_API_KEY exists:", !!SILICONFLOW_API_KEY)

  // 获取角色配置，如果没有提供characterId则使用默认角色
  const character = characterId ? getCharacterById(characterId) : getDefaultCharacter()
  const systemPrompt = getSystemPrompt(character)
  console.log("[v0] Using character:", character.name, "personality:", character.personality)

  // Prepare messages with system prompt
  const formattedMessages = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...messages,
  ]

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
    // Call SiliconFlow API with streaming
    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
      },
      body: JSON.stringify({
        model: "deepseek-ai/DeepSeek-V3.2-Exp",
        messages: formattedMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.7,
      }),
    })

    console.log("[v0] SiliconFlow API response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] SiliconFlow API error response:", errorText)
      console.error("[v0] SiliconFlow API error status:", response.status)
      
      // 提供更详细的错误信息
      let errorMessage = `SiliconFlow API 错误: ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.error?.message) {
          errorMessage = errorJson.error.message
        }
      } catch (e) {
        // 如果无法解析 JSON，使用原始错误文本
        errorMessage = errorText || errorMessage
      }
      
      // 401 错误通常是 API Key 问题
      if (response.status === 401) {
        errorMessage = "SiliconFlow API Key 无效或已过期。请检查 .env.local 文件中的 SILICONFLOW_API_KEY 配置。"
      }
      
      throw new Error(errorMessage)
    }

    // Create a TransformStream to convert SiliconFlow SSE format to our custom format
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          console.error("[v0] No reader available")
          controller.close()
          return
        }

        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              console.log("[v0] Stream completed")
              controller.close()
              break
            }

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              const trimmedLine = line.trim()

              if (trimmedLine === "" || trimmedLine === "data: [DONE]") {
                continue
              }

              if (trimmedLine.startsWith("data: ")) {
                try {
                  const jsonStr = trimmedLine.slice(6)
                  const data = JSON.parse(jsonStr)

                  console.log("[v0] Parsed SSE data:", data)

                  // Extract content delta from SiliconFlow response
                  // SiliconFlow uses the same format as OpenAI: choices[0].delta.content
                  const delta = data.choices?.[0]?.delta?.content

                  if (delta) {
                    console.log("[v0] Sending delta:", delta)
                    // Send each character separately for smooth streaming effect
                    controller.enqueue(encoder.encode(delta))
                  }
                } catch (e) {
                  console.error("[v0] Error parsing SSE data:", e, "Line:", trimmedLine)
                }
              }
            }
          }
        } catch (error) {
          console.error("[v0] Stream reading error:", error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[v0] SiliconFlow API error:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to fetch response from AI"
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
