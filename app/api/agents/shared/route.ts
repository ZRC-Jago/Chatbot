import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET: 获取社区分享的智能体列表
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = (page - 1) * limit

    // 查询已分享的智能体
    const { data: sharedAgents, error } = await supabase
      .from("shared_agents")
      .select(`
        *,
        custom_agents:agent_id (
          id,
          name,
          avatar,
          voice,
          welcome_message,
          description
        )
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error("[agents] 查询错误:", error)
      return NextResponse.json(
        { error: "查询失败" },
        { status: 500 }
      )
    }

    // 获取总数
    const { count } = await supabase
      .from("shared_agents")
      .select("*", { count: "exact", head: true })

    return NextResponse.json({
      data: sharedAgents || [],
      total: count || 0,
      page,
      limit,
    })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
