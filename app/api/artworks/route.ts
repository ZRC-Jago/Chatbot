import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// 获取作品列表
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    const fileType = searchParams.get("file_type") // 'image' | 'video' | null
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "20")
    const offset = (page - 1) * limit

    // 构建查询
    let query = supabase
      .from("artworks")
      .select("*")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // 如果指定了文件类型，添加筛选
    if (fileType && (fileType === "image" || fileType === "video")) {
      query = query.eq("file_type", fileType)
    }

    const { data, error, count } = await query

    if (error) {
      console.error("[artworks] 查询错误:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      data: data || [],
      pagination: {
        page,
        limit,
        hasMore: (data?.length || 0) === limit,
      },
    })
  } catch (error) {
    console.error("[artworks] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// 创建新作品
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // 验证用户身份
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "未登录" }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, file_url, file_type, thumbnail_url, file_path } = body

    // 验证必填字段
    if (!file_url || !file_type) {
      return NextResponse.json(
        { error: "缺少必填字段: file_url, file_type" },
        { status: 400 }
      )
    }

    if (file_type !== "image" && file_type !== "video") {
      return NextResponse.json(
        { error: "file_type 必须是 'image' 或 'video'" },
        { status: 400 }
      )
    }

    // 获取用户信息
    const userEmail = user.email || ""
    const userName = user.user_metadata?.name || 
                     user.user_metadata?.full_name || 
                     userEmail.split("@")[0] || 
                     "匿名用户"

    // 插入作品记录
    const { data, error } = await supabase
      .from("artworks")
      .insert({
        user_id: user.id,
        user_email: userEmail,
        user_name: userName,
        prompt: prompt || null, // 视频可能没有提示词
        file_url: file_url,
        file_type: file_type,
        thumbnail_url: thumbnail_url || null,
        is_public: true,
        // 注意：如果数据库表没有 file_path 字段，这行会报错，需要先添加字段或移除这行
        // file_path: file_path || null,
      })
      .select()
      .single()

    if (error) {
      console.error("[artworks] 插入错误:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (error) {
    console.error("[artworks] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
