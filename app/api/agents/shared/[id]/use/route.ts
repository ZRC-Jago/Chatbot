export const runtime = "nodejs"

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// POST: 使用社区分享的智能体（复制到用户自己的列表）
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "未登录" },
        { status: 401 }
      )
    }

    const { id } = await params // shared_agents 的 id

    // 获取分享的智能体信息
    const { data: sharedAgent, error: sharedError } = await supabase
      .from("shared_agents")
      .select(`
        *,
        custom_agents:agent_id (
          *
        )
      `)
      .eq("id", id)
      .single()

    if (sharedError || !sharedAgent || !sharedAgent.custom_agents) {
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    const originalAgent = sharedAgent.custom_agents

    // 检查用户是否已经复制过这个智能体
    const { data: existingAgent } = await supabase
      .from("custom_agents")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", originalAgent.name)
      .eq("system_prompt", originalAgent.system_prompt)
      .single()

    if (existingAgent) {
      return NextResponse.json({
        success: true,
        data: existingAgent,
        message: "你已经拥有这个智能体了"
      })
    }

    // 复制智能体到用户自己的列表
    const { data: newAgent, error: createError } = await supabase
      .from("custom_agents")
      .insert({
        user_id: user.id,
        name: originalAgent.name,
        avatar: originalAgent.avatar,
        system_prompt: originalAgent.system_prompt,
        voice: originalAgent.voice,
        welcome_message: originalAgent.welcome_message,
        description: originalAgent.description,
        is_shared: false, // 复制后默认不分享
      })
      .select()
      .single()

    if (createError) {
      console.error("[agents] 复制错误:", createError)
      return NextResponse.json(
        { error: "复制失败" },
        { status: 500 }
      )
    }

    // 增加使用次数
    await supabase
      .from("shared_agents")
      .update({
        usage_count: (sharedAgent.usage_count || 0) + 1,
      })
      .eq("id", id)

    return NextResponse.json({
      success: true,
      data: newAgent,
    })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
