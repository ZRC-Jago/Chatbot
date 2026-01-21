import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// 获取当前用户的所有作品
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const fileType = searchParams.get("file_type") // 'image' | 'video' | null

    // 构建查询
    let query = supabase
      .from("artworks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })

    // 如果指定了文件类型，添加筛选
    if (fileType && (fileType === "image" || fileType === "video")) {
      query = query.eq("file_type", fileType)
    }

    const { data, error } = await query

    if (error) {
      console.error("[artworks] 查询错误:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error("[artworks] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}
