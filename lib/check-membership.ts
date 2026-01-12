// 诊断工具：检查会员状态和数据库表
import { createClient } from "@/lib/supabase/client"

export async function checkMembershipStatus() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return {
      user: null,
      error: "用户未登录",
    }
  }

  const results: any = {
    userId: user.id,
    userEmail: user.email,
    checks: {},
  }

  // 检查永久会员表
  try {
    const { data, error } = await supabase
      .from("one_time_purchases")
      .select("*")
      .eq("user_id", user.id)
      .limit(5)

    results.checks.oneTimePurchases = {
      exists: !error,
      error: error?.message,
      count: data?.length || 0,
      data: data || [],
    }
  } catch (e: any) {
    results.checks.oneTimePurchases = {
      exists: false,
      error: e.message,
      count: 0,
    }
  }

  // 检查订阅表
  try {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .limit(5)

    results.checks.subscriptions = {
      exists: !error,
      error: error?.message,
      count: data?.length || 0,
      data: data || [],
    }
  } catch (e: any) {
    results.checks.subscriptions = {
      exists: false,
      error: e.message,
      count: 0,
    }
  }

  // 检查聊天使用表
  try {
    const today = new Date().toISOString().split("T")[0]
    const { data, error } = await supabase
      .from("chat_usage")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", today)

    results.checks.chatUsage = {
      exists: !error,
      error: error?.message,
      todayCount: data?.[0]?.count || 0,
      data: data || [],
    }
  } catch (e: any) {
    results.checks.chatUsage = {
      exists: false,
      error: e.message,
      todayCount: 0,
    }
  }

  return results
}







