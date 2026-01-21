import { getVisionModel } from "@/lib/models"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.error("[v0] SILICONFLOW_API_KEY 环境变量未配置")
}

// 处理流式响应的辅助函数
function handleStreamResponse(response: Response, modelName?: string, attemptCount?: string) {
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

                // Extract content delta from SiliconFlow response
                const delta = data.choices?.[0]?.delta?.content

                if (delta) {
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

  const headers: HeadersInit = {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  }
  
  // 添加模型信息到响应头
  if (modelName) {
    headers["X-Vision-Model"] = modelName
  }
  if (attemptCount) {
    headers["X-Attempt-Count"] = attemptCount
  }

  return new Response(stream, { headers })
}

export async function POST(req: Request) {
  try {
    const { messages, imageUrl } = await req.json()

    console.log("[v0] Vision API: Received request")
    console.log("[v0] Messages count:", messages?.length || 0)
    console.log("[v0] Image URL:", imageUrl)

    // 视觉模式支持纯文本聊天，不强制要求图片
    // 如果有图片则分析图片，如果没有图片则进行普通对话
    const hasImage = messages?.some((msg: any) => msg.imageUrl || msg.userImageUrl) || imageUrl

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

    // 构建消息，支持图片输入
    // 根据 SiliconFlow API，图片需要以 base64 或 URL 形式传递
    // 这里我们使用 content 数组格式，支持文本和图片混合
    const formattedMessages = messages.map((msg: any) => {
      // 只处理用户消息，并且只处理包含图片的消息
      if (msg.role === "user" && (msg.imageUrl || msg.userImageUrl)) {
        // 用户消息包含图片（优先使用 userImageUrl，如果没有则使用 imageUrl）
        const imgUrl = msg.userImageUrl || msg.imageUrl
        
        // 确保图片 URL 是有效的 base64 数据 URL 或有效的 URL
        let finalImageUrl = imgUrl
        if (imgUrl.startsWith("data:image")) {
          finalImageUrl = imgUrl
        } else if (imgUrl.startsWith("http://") || imgUrl.startsWith("https://")) {
          finalImageUrl = imgUrl
        } else {
          // 假设是 base64，添加 data URL 前缀
          finalImageUrl = `data:image/jpeg;base64,${imgUrl}`
        }
        
        return {
          role: "user",
          content: [
            {
              type: "text",
              text: msg.content || "请分析这张图片",
            },
            {
              type: "image_url",
              image_url: {
                url: finalImageUrl,
              },
            },
          ],
        }
      }
      // 普通文本消息 - 确保 content 是字符串
      return {
        role: msg.role,
        content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
      }
    })

    console.log("[v0] Vision API: Formatted messages:", JSON.stringify(formattedMessages, null, 2))

    // 获取视觉模型（从统一配置中获取）
    const visionModel = getVisionModel()
    
    console.log("========================================")
    console.log("👁️ [视觉API] 开始处理视觉请求")
    console.log(`  - 使用的模型: ${visionModel}`)
    console.log("  - 消息数量:", formattedMessages.length)
    console.log("  - 是否有图片:", hasImage)
    console.log("========================================")
    
    const startTime = Date.now()
    
    // 调用 SiliconFlow API
    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        messages: formattedMessages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.7,
        top_p: 0.7,
        top_k: 50,
        frequency_penalty: 0.5,
        response_format: {
          type: "text",
        },
      }),
    })

    const duration = Date.now() - startTime
    console.log(`📊 [视觉API] 模型 ${visionModel} 响应:`)
    console.log(`  - 状态码: ${response.status}`)
    console.log(`  - 响应时间: ${duration}ms`)

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ [视觉API] 模型 ${visionModel} 失败:`)
      console.error(`  - 错误信息: ${errorText.substring(0, 200)}${errorText.length > 200 ? "..." : ""}`)
      
      // 提供更友好的错误信息
      let friendlyError = "视觉模型调用失败。"
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.message) {
          if (errorJson.message.includes("does not exist") || errorJson.message.includes("Model does not exist")) {
            friendlyError = `模型不存在: ${visionModel}。请在 lib/models.ts 中修改 VISION_MODEL_DEFAULT 或在 .env.local 文件中设置 VISION_MODEL=你的视觉模型名称`
          } else if (errorJson.message.includes("VLM") || errorJson.message.includes("not a VLM")) {
            friendlyError = `模型 ${visionModel} 不支持视觉输入。请在 lib/models.ts 中修改 VISION_MODEL_DEFAULT 为支持视觉的模型`
          } else {
            friendlyError = errorJson.message
          }
        }
      } catch (e) {
        // 如果无法解析 JSON，使用原始错误文本
        friendlyError = errorText || friendlyError
      }
      
      return new Response(
        JSON.stringify({ 
          error: `${friendlyError} 错误详情: ${errorText}` 
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    console.log("========================================")
    console.log("✅ [视觉API] 成功调用模型")
    console.log(`  - 使用的模型: ${visionModel}`)
    console.log(`  - 响应时间: ${duration}ms`)
    console.log("========================================")
    
    // 返回流式响应，并在响应头中添加模型信息
    return handleStreamResponse(response, visionModel, "1/1")
  } catch (error) {
    console.error("[v0] Vision API: Error:", error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to analyze image" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
