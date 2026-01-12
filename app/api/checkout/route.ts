import { NextRequest, NextResponse } from "next/server"
import { Creem } from "creem"
import { createClient } from "@/lib/supabase/server"

/**
 * Initialize Creem SDK client
 * Server index 1 is used for test environment
 */
const creem = new Creem({
  serverIdx: 1,
})

/**
 * GET /api/checkout
 * 
 * Creates a new checkout session for a specific product.
 * Requires authentication and product ID as query parameter.
 */
export async function GET(req: NextRequest) {
  try {
    console.log("[v0] ========== Checkout API 调用 ==========")
    
    // 获取 Supabase 用户
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error("[v0] ❌ 用户未登录:", authError)
      return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 })
    }

    console.log("[v0] ✅ 用户已登录:", user.id, user.email)

    const productId = req.nextUrl.searchParams.get("product_id")

    if (!productId) {
      console.error("[v0] ❌ 缺少产品 ID")
      return NextResponse.json({ error: "缺少产品 ID" }, { status: 400 })
    }

    console.log("[v0] 产品 ID:", productId)

    const apiKey = process.env.CREEM_API_KEY
    
    // 构建 successUrl
    // Creem 要求 URL 必须是有效的格式（http:// 或 https:// 开头）
    let successUrl = process.env.SUCCESS_URL
    
    if (!successUrl) {
      // 如果没有设置 SUCCESS_URL，使用请求的 origin
      const origin = req.nextUrl.origin
      successUrl = `${origin}/account`
    }
    
    // 确保 URL 格式正确
    // 移除尾随斜杠（除了协议后的双斜杠）
    successUrl = successUrl.replace(/\/+$/, '')
    if (!successUrl.endsWith('/account')) {
      successUrl = successUrl.endsWith('/') ? `${successUrl}account` : `${successUrl}/account`
    }
    
    // 验证 URL 格式
    try {
      new URL(successUrl)
    } catch (e) {
      console.error("[v0] ❌ Success URL 格式无效:", successUrl)
      return NextResponse.json(
        { error: "支付配置错误: Success URL 格式无效" },
        { status: 500 }
      )
    }

    // 检查是否是 localhost，如果是则提示使用 ngrok
    if (successUrl.includes('localhost') || successUrl.includes('127.0.0.1')) {
      console.warn("[v0] ⚠️ 警告: Success URL 使用 localhost，Creem 可能无法访问")
      console.warn("[v0] ⚠️ 建议使用 ngrok 暴露本地服务，并在 .env.local 中设置 SUCCESS_URL")
      console.warn("[v0] ⚠️ 例如: SUCCESS_URL=https://xxxx.ngrok.io/account")
    }

    console.log("[v0] CREEM_API_KEY 存在:", !!apiKey)
    console.log("[v0] Success URL (最终):", successUrl)

    if (!apiKey) {
      console.error("[v0] ❌ CREEM_API_KEY 环境变量未配置")
      return NextResponse.json(
        { error: "支付服务配置错误" },
        { status: 500 }
      )
    }

    // 创建 checkout session
    console.log("[v0] 准备创建 checkout session...")
    
    // 构建请求参数
    const createCheckoutRequest = {
      productId: productId,
      successUrl: successUrl,
      // 使用用户 ID 作为 requestId，用于 webhook 中识别用户
      requestId: user.id,
      // 添加用户元数据
      metadata: {
        email: user.email || "",
        userId: user.id,
      },
    }
    
    console.log("[v0] 请求参数:", JSON.stringify(createCheckoutRequest, null, 2))
    console.log("[v0] Success URL 类型:", typeof successUrl)
    console.log("[v0] Success URL 长度:", successUrl.length)
    console.log("[v0] Success URL 是否以 http 开头:", successUrl.startsWith('http://') || successUrl.startsWith('https://'))

    try {
      const checkoutSessionResponse = await creem.createCheckout({
        xApiKey: apiKey,
        createCheckoutRequest: createCheckoutRequest,
      })
      
      console.log("[v0] ✅ Checkout session 创建成功")
      console.log("[v0] Checkout URL:", checkoutSessionResponse.checkoutUrl)
      console.log("[v0] ======================================")

      return NextResponse.json({
        success: true,
        checkoutUrl: checkoutSessionResponse.checkoutUrl,
      })
    } catch (checkoutError: any) {
      // 如果是 URL 格式错误，提供更详细的错误信息
      if (checkoutError?.message?.includes('URL must be valid') || checkoutError?.status === 400) {
        console.error("[v0] ❌ Creem API 返回 URL 格式错误")
        console.error("[v0] 当前 Success URL:", successUrl)
        console.error("[v0] 错误详情:", JSON.stringify(checkoutError, null, 2))
        
        return NextResponse.json(
          { 
            error: "支付配置错误: Success URL 格式无效",
            details: `Creem API 不接受此 URL 格式: ${successUrl}`,
            suggestion: "请检查 .env.local 中的 SUCCESS_URL 是否正确设置，或使用 ngrok 暴露本地服务"
          },
          { status: 500 }
        )
      }
      // 重新抛出其他错误
      throw checkoutError
    }

    } catch (error) {
    console.error("[v0] ❌ 创建支付会话错误:", error)
    
    // 详细错误信息
    if (error instanceof Error) {
      console.error("[v0] 错误消息:", error.message)
      console.error("[v0] 错误堆栈:", error.stack)
    } else {
      console.error("[v0] 错误对象:", JSON.stringify(error, null, 2))
    }
    
    // 返回更详细的错误信息
    const errorMessage = error instanceof Error ? error.message : "创建支付会话失败"
    return NextResponse.json(
      { 
        error: "创建支付会话失败",
        details: errorMessage,
      },
      { status: 500 }
    )
  }
}

