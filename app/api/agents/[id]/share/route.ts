export const runtime = "nodejs"

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// POST: 分享智能体到社区
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

    const { id } = await params

    // 检查智能体是否存在且属于当前用户
    const { data: agent, error: agentError } = await supabase
      .from("custom_agents")
      .select("*")
      .eq("id", id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    if (agent.user_id !== user.id) {
      return NextResponse.json(
        { error: "无权分享" },
        { status: 403 }
      )
    }

    // 更新智能体为已分享状态
    const { error: updateError } = await supabase
      .from("custom_agents")
      .update({
        is_shared: true,
        shared_at: new Date().toISOString(),
      })
      .eq("id", id)

    if (updateError) {
      console.error("[agents] 更新分享状态错误:", updateError)
      return NextResponse.json(
        { error: "分享失败" },
        { status: 500 }
      )
    }

    // 创建或更新分享记录
    const { data: userData } = await supabase
      .from("custom_agents")
      .select("user_id")
      .eq("id", id)
      .single()

    const { data: sharedAgent, error: shareError } = await supabase
      .from("shared_agents")
      .upsert({
        agent_id: id,
        creator_id: user.id,
        creator_name: user.email?.split("@")[0] || "用户",
        creator_email: user.email || null,
        name: agent.name,
        description: agent.description || null,
        usage_count: 0,
      }, {
        onConflict: "agent_id"
      })
      .select()
      .single()

    if (shareError) {
      console.error("[agents] 创建分享记录错误:", shareError)
      // 即使创建分享记录失败，也返回成功（因为智能体已经标记为已分享）
    }

    return NextResponse.json({ 
      success: true, 
      data: sharedAgent || { agent_id: id } 
    })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// DELETE: 取消分享
export async function DELETE(
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

    const { id } = await params

    // 检查智能体是否存在且属于当前用户
    const { data: agent, error: agentError } = await supabase
      .from("custom_agents")
      .select("user_id")
      .eq("id", id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    if (agent.user_id !== user.id) {
      return NextResponse.json(
        { error: "无权操作" },
        { status: 403 }
      )
    }

    // 更新智能体为未分享状态
    await supabase
      .from("custom_agents")
      .update({
        is_shared: false,
        shared_at: null,
      })
      .eq("id", id)

    // 删除分享记录
    await supabase
      .from("shared_agents")
      .delete()
      .eq("agent_id", id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
