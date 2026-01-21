export const runtime = "nodejs"

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET: 获取单个分享的智能体详情
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // 从 shared_agents 表中查找
    const { data: sharedAgent, error: sharedError } = await supabase
      .from("shared_agents")
      .select("*")
      .eq("id", id)
      .single()

    if (sharedError || !sharedAgent) {
      console.error("[agents] 查询 shared_agents 错误:", sharedError)
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    // 获取对应的 custom_agents 信息
    const { data: customAgent, error: agentError } = await supabase
      .from("custom_agents")
      .select("*")
      .eq("id", sharedAgent.agent_id)
      .eq("is_shared", true)
      .single()

    if (agentError || !customAgent) {
      console.error("[agents] 查询 custom_agents 错误:", agentError)
      return NextResponse.json(
        { error: "智能体不存在或已被取消分享" },
        { status: 404 }
      )
    }

    // 合并数据
    const result = {
      ...sharedAgent,
      agent: customAgent,
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
