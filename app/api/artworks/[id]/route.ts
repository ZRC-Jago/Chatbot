import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// 获取单个作品详情
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient()
    // Next.js 16 中 params 可能是 Promise
    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams

    const { data, error } = await supabase
      .from("artworks")
      .select("*")
      .eq("id", id)
      .eq("is_public", true)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "作品不存在" }, { status: 404 })
      }
      console.error("[artworks] 查询错误:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // 增加浏览数
    await supabase
      .from("artworks")
      .update({ views_count: (data.views_count || 0) + 1 })
      .eq("id", id)

    return NextResponse.json({ data })
  } catch (error) {
    console.error("[artworks] 服务器错误:", error)
    return NextResponse.json(
      { error: "服务器错误" },
      { status: 500 }
    )
  }
}

// 删除作品（撤回）
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const supabase = await createClient()
    // Next.js 16 中 params 可能是 Promise
    const resolvedParams = await Promise.resolve(params)
    const { id } = resolvedParams

    // 验证用户身份
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user || !user.id) {
      console.error("[artworks] 用户身份验证失败:", { authError, user: user?.id })
      return NextResponse.json({ error: "未登录或用户信息无效" }, { status: 401 })
    }

    // 检查作品是否存在且属于当前用户
    const { data: artwork, error: fetchError } = await supabase
      .from("artworks")
      .select("user_id, file_url")
      .eq("id", id)
      .single()

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return NextResponse.json({ error: "作品不存在" }, { status: 404 })
      }
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (artwork.user_id !== user.id) {
      return NextResponse.json({ error: "无权删除此作品" }, { status: 403 })
    }

    // 删除 Storage 中的文件（如果存在）
    if (artwork.file_url) {
      try {
        // 从 URL 中提取文件路径
        // URL 格式示例：
        // https://xxx.supabase.co/storage/v1/object/public/artworks/artworks/image_1234567890_abc123.png
        // 需要提取：artworks/image_1234567890_abc123.png
        
        let filePath: string | null = null
        const url = artwork.file_url
        
        // 移除查询参数（如果有）
        const urlWithoutParams = url.split("?")[0]
        
        // 方法1：查找 "artworks/" 之后的部分
        // URL 结构：.../storage/v1/object/public/artworks/artworks/文件名
        const publicIndex = urlWithoutParams.indexOf("/storage/v1/object/public/artworks/")
        if (publicIndex !== -1) {
          // 提取 "artworks/" 之后的所有内容
          const afterPublic = urlWithoutParams.substring(publicIndex + "/storage/v1/object/public/artworks/".length)
          // 如果路径是 "artworks/文件名"，直接使用
          // 如果路径只是 "文件名"，添加 "artworks/" 前缀
          if (afterPublic.startsWith("artworks/")) {
            filePath = afterPublic
          } else {
            filePath = `artworks/${afterPublic}`
          }
        } else {
          // 方法2：查找最后一个 "artworks/" 的位置
          const lastArtworksIndex = urlWithoutParams.lastIndexOf("artworks/")
          if (lastArtworksIndex !== -1) {
            filePath = urlWithoutParams.substring(lastArtworksIndex)
          } else {
            // 方法3：从 URL 末尾提取文件名
            const urlParts = urlWithoutParams.split("/")
            const fileName = urlParts[urlParts.length - 1]
            if (fileName) {
              filePath = `artworks/${fileName}`
            }
          }
        }
        
        console.log("[artworks] 原始 URL:", url)
        console.log("[artworks] 提取的文件路径:", filePath)
        
        if (!filePath) {
          console.warn("[artworks] ⚠️ 无法提取文件路径，跳过文件删除")
          console.warn("[artworks] URL 格式可能不正确:", url)
        } else {
          const { error: storageError, data: removeData } = await supabase.storage
            .from("artworks")
            .remove([filePath])

          if (storageError) {
            console.error("[artworks] ❌ 删除文件失败:", storageError)
            console.error("[artworks] 文件路径:", filePath)
            console.error("[artworks] 错误详情:", JSON.stringify(storageError))
            // 继续删除数据库记录，即使文件删除失败
          } else {
            console.log("[artworks] ✅ 文件删除成功:", filePath)
            console.log("[artworks] 删除结果:", removeData)
          }
        }
      } catch (error) {
        console.error("[artworks] ❌ 删除文件时出错:", error)
        console.error("[artworks] 错误堆栈:", error instanceof Error ? error.stack : undefined)
      }
    } else {
      console.warn("[artworks] ⚠️ 作品没有 file_url，跳过文件删除")
    }

    // 删除数据库记录
    console.log("[artworks] 准备删除数据库记录，ID:", id, "用户ID:", user.id)
    
    // 验证 ID 格式
    if (!id || typeof id !== 'string' || id === 'undefined') {
      console.error("[artworks] 无效的作品ID:", id)
      return NextResponse.json({ error: "无效的作品ID" }, { status: 400 })
    }
    
    if (!user.id || typeof user.id !== 'string') {
      console.error("[artworks] 无效的用户ID:", user.id)
      return NextResponse.json({ error: "无效的用户ID" }, { status: 401 })
    }
    
    const { error: deleteError, data: deleteData } = await supabase
      .from("artworks")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id) // 确保只能删除自己的作品

    if (deleteError) {
      console.error("[artworks] 删除数据库记录错误:", deleteError)
      console.error("[artworks] 错误详情:", {
        message: deleteError.message,
        code: deleteError.code,
        details: deleteError.details,
        hint: deleteError.hint,
      })
      
      // 如果是权限错误
      if (deleteError.message?.includes("permission") || 
          deleteError.message?.includes("policy") ||
          deleteError.code === "42501") {
        return NextResponse.json({ 
          error: "删除权限不足。请检查数据库 RLS 策略设置。",
          code: "PERMISSION_DENIED",
          details: deleteError.message
        }, { status: 403 })
      }
      
      return NextResponse.json({ 
        error: deleteError.message || "删除失败",
        details: JSON.stringify(deleteError)
      }, { status: 500 })
    }

    console.log("[artworks] 删除成功")
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[artworks] 服务器错误:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error("[artworks] 错误堆栈:", errorStack)
    return NextResponse.json(
      { 
        error: errorMessage || "服务器错误",
        details: errorStack
      },
      { status: 500 }
    )
  }
}
