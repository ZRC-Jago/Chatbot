import { IMAGE_GENERATION_MODEL, PROMPT_OPTIMIZATION_MODEL } from "@/lib/models"

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
    // 构建上下文提示
    const contextMessages = messages.slice(0, -1) // 除了最后一条（当前prompt）
    const contextText = contextMessages
      .map(m => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n")

    const optimizationPrompt = `你是一个图片生成提示词优化助手。用户提供了对话历史和当前的图片生成请求。

对话历史：
${contextText}

当前请求：${prompt}

请基于对话历史，优化用户的图片生成提示词。如果用户说"再生成一次"、"不满意"、"换个风格"等，请参考之前的对话内容，适当调整提示词（比如改变风格、角度、细节等），但保持核心主题不变。

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
            content: "你是一个专业的图片生成提示词优化助手，擅长根据对话历史优化图片生成提示词。",
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
    const { prompt, messages, negative_prompt, image_size, batch_size, seed, num_inference_steps, guidance_scale, cfg, image, image2, image3 } = await req.json()

    console.log("[v0] Image Generation API: Received request")
    console.log("[v0] Prompt:", prompt)
    console.log("[v0] Messages history count:", messages?.length || 0)

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
      console.log("[v0] Optimizing prompt with context...")
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

    // 构建请求体
    const requestBody: any = {
      model: IMAGE_GENERATION_MODEL,
      prompt: finalPrompt,
      image_size: image_size || "1024x1024",
      batch_size: batch_size || 1,
      num_inference_steps: num_inference_steps || 20,
      guidance_scale: guidance_scale || 7.5,
      cfg: cfg || 10.05,
    }

    // 可选参数
    if (negative_prompt) {
      requestBody.negative_prompt = negative_prompt
    }
    if (seed) {
      requestBody.seed = seed
    }
    if (image) {
      requestBody.image = image
    }
    if (image2) {
      requestBody.image2 = image2
    }
    if (image3) {
      requestBody.image3 = image3
    }

    console.log("[v0] Image Generation API: Request body:", JSON.stringify(requestBody, null, 2))

    // 调用 SiliconFlow API
    const response = await fetch("https://api.siliconflow.cn/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    })

    console.log("[v0] Image Generation API: Response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Image Generation API: Error:", errorText)
      return new Response(
        JSON.stringify({ 
          error: `Image generation failed: ${response.status} - ${errorText}` 
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const data = await response.json()
    console.log("[v0] Image Generation API: Response data:", data)

    // 返回图片 URL
    if (data.images && data.images.length > 0 && data.images[0].url) {
      return new Response(
        JSON.stringify({ 
          imageUrl: data.images[0].url 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    } else if (data.data && data.data.length > 0 && data.data[0].url) {
      // 兼容另一种返回格式
      return new Response(
        JSON.stringify({ 
          imageUrl: data.data[0].url 
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    } else {
      return new Response(
        JSON.stringify({ 
          error: "No image URL found in response" 
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      )
    }
  } catch (error) {
    console.error("[v0] Image Generation API: Error:", error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to generate image" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
