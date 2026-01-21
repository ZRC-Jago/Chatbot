import { VIDEO_GENERATION_MODEL, PROMPT_OPTIMIZATION_MODEL } from "@/lib/models"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.error("[v0] SILICONFLOW_API_KEY 环境变量未配置")
}

// 使用 AI 模型优化 prompt，基于对话历史
async function optimizePromptWithContext(prompt: string, messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!messages || messages.length <= 1) {
    return prompt
  }

  try {
    const contextMessages = messages.slice(0, -1)
    const contextText = contextMessages
      .map(m => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n")

    const optimizationPrompt = `你是一个视频生成提示词优化助手。用户提供了对话历史和当前的视频生成请求。

对话历史：
${contextText}

当前请求：${prompt}

请基于对话历史，优化用户的视频生成提示词。如果用户说"再生成一次"、"不满意"、"换个风格"等，请参考之前的对话内容，适当调整提示词（比如改变风格、角度、细节等），但保持核心主题不变。

只返回优化后的提示词，不要添加任何解释。如果当前请求已经很完整，可以直接返回。`

    const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PROMPT_OPTIMIZATION_MODEL,
        messages: [
          {
            role: "system",
            content: "你是一个专业的视频生成提示词优化助手，擅长根据对话历史优化视频生成提示词。",
          },
          {
            role: "user",
            content: optimizationPrompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
    })

    if (!response.ok) {
      console.error("[v0] Prompt optimization failed, using original prompt")
      return prompt
    }

    const data = await response.json()
    const optimizedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt
    
    console.log("[v0] Original prompt:", prompt)
    console.log("[v0] Optimized prompt:", optimizedPrompt)
    
    return optimizedPrompt
  } catch (error) {
    console.error("[v0] Error optimizing prompt:", error)
    return prompt
  }
}

export async function POST(req: Request) {
  try {
    let requestData
    try {
      requestData = await req.json()
    } catch (error) {
      console.error("[v0] 视频生成API: JSON 解析错误:", error)
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body" 
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const { prompt, messages, negative_prompt, image_size, seed, imageUrl, duration } = requestData

    console.log("========================================")
    console.log("🎬 [视频生成API] 开始处理视频生成请求")
    console.log("  - Prompt:", prompt)
    console.log("  - 消息历史数量:", messages?.length || 0)
    console.log("  - 图片URL:", imageUrl ? (imageUrl.substring(0, 50) + "...") : "未提供")
    console.log("  - 图片URL长度:", imageUrl ? imageUrl.length : 0)
    console.log("  - 图片格式:", imageUrl?.startsWith("data:") ? "base64 data URL" : imageUrl ? "普通 URL" : "无")
    console.log("  - 尺寸:", image_size || "1280x720")
    console.log("  - 时长:", duration || 5, "秒")
    console.log("  - API Key 存在:", !!SILICONFLOW_API_KEY)
    console.log("========================================")

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // 如果有消息历史，使用 AI 优化 prompt
    let finalPrompt = prompt
    if (messages && messages.length > 1) {
      console.log("[v0] 优化 prompt 中...")
      finalPrompt = await optimizePromptWithContext(prompt, messages)
    }

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

    // 处理图片 URL
    // API 支持两种格式：
    // 1. 图片 URL (img_url)
    // 2. data:image/png;base64,XXX 格式
    let finalImageUrl = imageUrl
    
    if (finalImageUrl && finalImageUrl.startsWith("data:")) {
      console.log("[v0] 视频生成API: 检测到 data URL 格式，长度:", finalImageUrl.length)
      console.log("[v0] 视频生成API: data URL 前缀:", finalImageUrl.substring(0, 30) + "...")
      // API 支持 data:image/png;base64,XXX 格式，直接使用
    } else if (finalImageUrl) {
      console.log("[v0] 视频生成API: 检测到普通 URL 格式:", finalImageUrl.substring(0, 100))
    }

    // 构建请求体
    const requestBody: any = {
      model: VIDEO_GENERATION_MODEL,
      prompt: finalPrompt,
      image_size: image_size || "1280x720",
    }

    // 可选参数
    if (negative_prompt) {
      requestBody.negative_prompt = negative_prompt
    }
    if (seed !== undefined && seed !== null) {
      requestBody.seed = seed
    }
    if (finalImageUrl) {
      requestBody.image = finalImageUrl
    }
    if (duration !== undefined && duration !== null) {
      requestBody.duration = duration
    }
    
    // 记录请求体（如果图片太长，不完整记录）
    if (finalImageUrl && finalImageUrl.length > 10000) {
      console.log("[v0] 视频生成API: 请求体（图片数据已省略）:", JSON.stringify({ ...requestBody, image: `[base64数据，长度: ${finalImageUrl.length}]` }, null, 2))
    } else {
      console.log("[v0] 视频生成API: 请求体:", JSON.stringify(requestBody, null, 2))
    }

    // 调用 SiliconFlow 视频生成 API
    // 注意：视频生成可能需要较长时间，设置较长的超时时间
    let response
    try {
      // 创建 AbortController 用于超时控制
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000) // 60秒超时
      
      console.log("[v0] 视频生成API: 开始调用 SiliconFlow API...")
      console.log("[v0] 视频生成API: 请求 URL: https://api.siliconflow.cn/v1/video/submit")
      console.log("[v0] 视频生成API: 请求体大小:", JSON.stringify(requestBody).length, "字节")
      
      response = await fetch("https://api.siliconflow.cn/v1/video/submit", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)
      console.log("[v0] 视频生成API: API 调用成功，响应状态:", response.status)
    } catch (fetchError: any) {
      console.error("[v0] 视频生成API: Fetch 错误详情:")
      console.error("  - 错误类型:", fetchError?.name)
      console.error("  - 错误消息:", fetchError?.message)
      console.error("  - 错误堆栈:", fetchError?.stack)
      
      let errorMessage = "Failed to fetch from SiliconFlow API"
      if (fetchError?.name === "AbortError") {
        errorMessage = "请求超时（60秒）。视频生成可能需要更长时间，请稍后重试。"
      } else if (fetchError instanceof Error) {
        errorMessage = `网络错误: ${fetchError.message}`
      } else {
        errorMessage = `未知错误: ${String(fetchError)}`
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          details: fetchError instanceof Error ? fetchError.message : String(fetchError)
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    console.log("[v0] 视频生成API: 响应状态:", response.status)

    if (!response.ok) {
      let errorText
      let errorData
      try {
        errorText = await response.text()
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || `HTTP ${response.status}: ${response.statusText}` }
      }
      
      console.error("[v0] 视频生成API: 错误:", errorData)
      
      // 解析错误信息
      let errorMessage = errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`
      
      // 如果是账户余额不足的错误
      if (errorData.code === 30001 || errorMessage.includes("balance is insufficient") || errorMessage.includes("余额不足")) {
        errorMessage = "账户余额不足。请检查您的 SiliconFlow API 账户余额，或联系管理员充值。"
      } else if (errorData.code) {
        errorMessage = `[错误代码 ${errorData.code}] ${errorMessage}`
      }
      
      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          code: errorData.code,
          details: errorData
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const data = await response.json()
    console.log("[v0] 视频生成API: 响应数据:", JSON.stringify(data, null, 2))
    console.log("[v0] 视频生成API: 响应数据类型:", typeof data)
    console.log("[v0] 视频生成API: 响应数据键:", Object.keys(data || {}))

    // 返回视频 URL 或任务 ID
    // 根据 API 响应格式，可能需要轮询获取视频 URL
    // 尝试多种可能的字段名
    const videoUrl = data.video_url || data.videoUrl || data.url || data.video || data.result?.video_url || data.result?.videoUrl || data.data?.video_url || data.results?.videos?.[0]?.url
    const taskId = data.requestId || data.request_id || data.task_id || data.taskId || data.id || data.task?.id || data.result?.task_id || data.result?.taskId || data.data?.requestId
    
    console.log("[v0] 视频生成API: 提取的 videoUrl:", videoUrl)
    console.log("[v0] 视频生成API: 提取的 taskId:", taskId)

    if (videoUrl) {
      console.log("[v0] 视频生成API: 返回视频 URL")
      return new Response(
        JSON.stringify({ 
          videoUrl: videoUrl 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    } else if (taskId) {
      // 如果有 task_id，返回任务 ID，前端需要轮询获取结果
      // 注意：API 返回的可能是 requestId，统一使用 requestId 字段名
      console.log("[v0] 视频生成API: 返回任务 ID (requestId):", taskId)
      return new Response(
        JSON.stringify({ 
          requestId: taskId, // 使用 requestId 字段名，与状态查询 API 保持一致
          taskId: taskId, // 同时保留 taskId 以兼容旧代码
          message: "视频生成任务已提交，请稍候查询结果"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    } else {
      // 如果都没有，返回完整的响应数据以便调试
      console.error("[v0] 视频生成API: 未找到 videoUrl 或 taskId，完整响应:", JSON.stringify(data, null, 2))
      return new Response(
        JSON.stringify({ 
          error: "No video URL or task ID found in response",
          responseData: data // 包含完整响应以便调试
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }
  } catch (error) {
    console.error("[v0] 视频生成API: 未捕获的错误:", error)
    console.error("[v0] 视频生成API: 错误堆栈:", error instanceof Error ? error.stack : "无堆栈信息")
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate video",
        details: error instanceof Error ? error.stack : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
