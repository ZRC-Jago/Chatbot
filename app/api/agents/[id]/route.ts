export const runtime = "nodejs"

import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET: 获取单个智能体
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data: agent, error } = await supabase
      .from("custom_agents")
      .select("*")
      .eq("id", id)
      .single()

    if (error) {
      console.error("[agents] 查询错误:", error)
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    // 检查权限：只有所有者或已分享的智能体可以查看
    const { data: { user } } = await supabase.auth.getUser()
    if (!agent.is_shared && agent.user_id !== user?.id) {
      return NextResponse.json(
        { error: "无权访问" },
        { status: 403 }
      )
    }

    return NextResponse.json({ data: agent })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// PUT: 更新智能体
export async function PUT(
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
    const body = await request.json()
    const { name, avatar, system_prompt, voice, welcome_message, description } = body

    // 先检查智能体是否存在且属于当前用户
    const { data: existingAgent, error: checkError } = await supabase
      .from("custom_agents")
      .select("user_id")
      .eq("id", id)
      .single()

    if (checkError || !existingAgent) {
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    if (existingAgent.user_id !== user.id) {
      return NextResponse.json(
        { error: "无权修改" },
        { status: 403 }
      )
    }

    // 构建更新数据
    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (avatar !== undefined) updateData.avatar = avatar || name?.[0] || existingAgent.name?.[0]
    if (system_prompt !== undefined) updateData.system_prompt = system_prompt
    if (voice !== undefined) updateData.voice = voice
    if (welcome_message !== undefined) updateData.welcome_message = welcome_message
    if (description !== undefined) updateData.description = description

    const { data: agent, error } = await supabase
      .from("custom_agents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("[agents] 更新错误:", error)
      return NextResponse.json(
        { error: "更新失败" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: agent })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// DELETE: 删除智能体
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

    // 先检查智能体是否存在且属于当前用户
    const { data: existingAgent, error: checkError } = await supabase
      .from("custom_agents")
      .select("user_id, is_shared")
      .eq("id", id)
      .single()

    if (checkError || !existingAgent) {
      return NextResponse.json(
        { error: "智能体不存在" },
        { status: 404 }
      )
    }

    if (existingAgent.user_id !== user.id) {
      return NextResponse.json(
        { error: "无权删除" },
        { status: 403 }
      )
    }

    // 如果已分享，需要先删除分享记录
    if (existingAgent.is_shared) {
      await supabase
        .from("shared_agents")
        .delete()
        .eq("agent_id", id)
    }

    // 删除智能体
    const { error } = await supabase
      .from("custom_agents")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[agents] 删除错误:", error)
      return NextResponse.json(
        { error: "删除失败" },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
