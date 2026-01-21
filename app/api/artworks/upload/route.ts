import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// 上传文件到 Supabase Storage
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

    const formData = await request.formData()
    const file = formData.get("file") as File
    const fileType = formData.get("file_type") as string // 'image' | 'video'

    if (!file) {
      return NextResponse.json({ error: "未提供文件" }, { status: 400 })
    }

    if (fileType !== "image" && fileType !== "video") {
      return NextResponse.json(
        { error: "file_type 必须是 'image' 或 'video'" },
        { status: 400 }
      )
    }

    // 生成唯一文件名
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 9)
    const fileExt = file.name.split(".").pop() || (fileType === "image" ? "png" : "mp4")
    const fileName = `${fileType}_${timestamp}_${randomStr}.${fileExt}`
    const filePath = `artworks/${fileName}`

    // 将文件转换为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 上传到 Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("artworks")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("[artworks] 上传错误:", uploadError)
      console.error("[artworks] 错误详情:", {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError.error,
      })
      
      // 如果是 bucket 不存在，提供更友好的错误信息
      if (uploadError.message?.includes("Bucket not found") || 
          uploadError.message?.includes("bucket") ||
          uploadError.message?.includes("does not exist")) {
        return NextResponse.json({ 
          error: "Storage bucket 未创建。请在 Supabase Dashboard 中创建名为 'artworks' 的 Storage bucket。",
          code: "BUCKET_NOT_FOUND",
          details: uploadError.message
        }, { status: 500 })
      }
      
      // 如果是权限错误
      if (uploadError.message?.includes("permission") || 
          uploadError.message?.includes("policy") ||
          uploadError.message?.includes("access denied")) {
        return NextResponse.json({ 
          error: "Storage 权限不足。请检查 Storage 权限策略设置。",
          code: "PERMISSION_DENIED",
          details: uploadError.message
        }, { status: 500 })
      }
      
      return NextResponse.json({ 
        error: uploadError.message || "上传失败",
        details: JSON.stringify(uploadError)
      }, { status: 500 })
    }

    // 获取公开 URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("artworks").getPublicUrl(filePath)

    return NextResponse.json({
      file_url: publicUrl,
      file_path: filePath, // 保存文件路径，方便后续删除
    })
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
