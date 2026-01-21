import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET: 获取用户的智能体列表
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "未登录" },
        { status: 401 }
      )
    }

    const { data: agents, error } = await supabase
      .from("custom_agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[agents] 查询错误:", error)
      return NextResponse.json(
        { error: "查询失败" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data: agents || [] })
  } catch (error) {
    console.error("[agents] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// POST: 创建新的智能体
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "未登录" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, avatar, system_prompt, voice, welcome_message, description } = body

    // 验证必填字段
    if (!name || !system_prompt || !voice) {
      return NextResponse.json(
        { error: "名字、系统提示词和音色为必填项" },
        { status: 400 }
      )
    }

    // 如果没有提供头像，使用名字第一个字
    const avatarText = avatar || name[0]

    // 如果没有提供欢迎消息，使用默认格式
    const welcomeText = welcome_message || `你好，我是${name}。有什么可以帮助你的吗？`

    const { data: agent, error } = await supabase
      .from("custom_agents")
      .insert({
        user_id: user.id,
        name,
        avatar: avatarText,
        system_prompt,
        voice,
        welcome_message: welcomeText,
        description: description || null,
        is_shared: false,
      })
      .select()
      .single()

    if (error) {
      console.error("[agents] 创建错误:", error)
      return NextResponse.json(
        { error: "创建失败" },
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
