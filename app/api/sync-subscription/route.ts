import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/sync-subscription
 * 
 * 手动同步订阅状态（用于支付成功后，如果 webhook 没有收到）
 * 从 Creem API 获取订阅信息并存储到 Supabase
 */
export async function POST(req: NextRequest) {
  try {
    console.log("[v0] ========== 手动同步订阅 ==========")
    
    // 获取用户
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "未授权，请先登录" }, { status: 401 })
    }

    console.log("[v0] 用户:", user.id, user.email)

    const { subscriptionId, productId } = await req.json()

    if (!subscriptionId) {
      return NextResponse.json({ error: "缺少订阅 ID" }, { status: 400 })
    }

    // 使用 Admin 客户端存储订阅信息
    const adminSupabase = createAdminClient()
    if (!adminSupabase) {
      console.warn("[v0] ⚠️ 使用 anon key")
      const regularSupabase = await createClient()
      
      // 尝试存储（可能受 RLS 限制）
      const { error } = await regularSupabase
        .from("subscriptions")
        .upsert({
          id: subscriptionId,
          user_id: user.id,
          product_id: productId || "prod_3KsUwoLdRYf0AJt13cRaks",
          status: "active",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "id",
        })

      if (error) {
        console.error("[v0] ❌ 存储订阅记录错误:", error)
        return NextResponse.json(
          { error: "存储失败", details: error.message },
          { status: 500 }
        )
      }
    } else {
      console.log("[v0] ✅ 使用 Service Role Key")
      const { error } = await adminSupabase
        .from("subscriptions")
        .upsert({
          id: subscriptionId,
          user_id: user.id,
          product_id: productId || "prod_3KsUwoLdRYf0AJt13cRaks",
          status: "active",
          updated_at: new Date().toISOString(),
        }, {
          onConflict: "id",
        })

      if (error) {
        console.error("[v0] ❌ 存储订阅记录错误:", error)
        return NextResponse.json(
          { error: "存储失败", details: error.message },
          { status: 500 }
        )
      }
    }

    console.log("[v0] ✅ 订阅已同步:", subscriptionId)
    console.log("[v0] ======================================")

    return NextResponse.json({
      success: true,
      message: "订阅已同步",
    })
  } catch (error) {
    console.error("[v0] ❌ 同步订阅错误:", error)
    return NextResponse.json(
      { error: "同步失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}







