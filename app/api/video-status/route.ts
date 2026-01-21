import { VIDEO_GENERATION_MODEL } from "@/lib/models"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.error("[v0] SILICONFLOW_API_KEY 环境变量未配置")
}

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json()

    console.log("========================================")
    console.log("🎬 [视频状态API] 查询任务状态")
    console.log("  - RequestId:", requestId)
    console.log("========================================")

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: "requestId is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
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

    // 调用 SiliconFlow 视频状态查询 API
    const response = await fetch("https://api.siliconflow.cn/v1/video/status", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestId: requestId,
      }),
    })

    console.log("[v0] 视频状态API: 响应状态:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] 视频状态API: 错误:", errorText)
      return new Response(
        JSON.stringify({ 
          error: `Failed to query video status: ${response.status} - ${errorText}` 
        }),
        {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    const data = await response.json()
    console.log("[v0] 视频状态API: 响应数据:", JSON.stringify(data, null, 2))

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  } catch (error) {
    console.error("[v0] 视频状态API: 错误:", error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Failed to query video status" 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}
