import { createClient } from "@/lib/supabase/client"

export type MembershipType = "guest" | "free" | "member" | "lifetime"

export interface MembershipInfo {
  type: MembershipType
  label: string
  dailyLimit: number
  hasUnlimited: boolean
  expiresAt?: Date // 订阅到期时间（仅对 member 类型有效）
}

/**
 * 获取用户会员类型
 */
export async function getUserMembership(): Promise<MembershipInfo> {
  const supabase = createClient()
  
  // 检查用户是否登录
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return {
      type: "guest",
      label: "游客",
      dailyLimit: 3,
      hasUnlimited: false,
    }
  }

  // 检查是否有永久会员（一次性支付）
  const { data: lifetimePurchase, error: lifetimeError } = await supabase
    .from("one_time_purchases")
    .select("*")
    .eq("user_id", user.id)
    .eq("product_id", "prod_1M6yb3ZGysGUHKNwnlMV8P")
    .eq("status", "completed")
    .maybeSingle()

  if (lifetimeError) {
    // 忽略表不存在的错误，继续查询订阅
    const errorCode = lifetimeError.code || ''
    const errorMessage = lifetimeError.message || JSON.stringify(lifetimeError)
    
    // PGRST301 或 42P01 表示表不存在
    if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
      console.warn("[v0] one_time_purchases 表不存在，跳过查询")
    } else {
      console.error("[v0] 查询永久会员错误:", lifetimeError)
    }
  }

  if (lifetimePurchase) {
    console.log("[v0] 用户是永久会员:", lifetimePurchase)
    return {
      type: "lifetime",
      label: "永久会员",
      dailyLimit: Infinity,
      hasUnlimited: true,
    }
  }

  // 检查是否有订阅会员
  console.log("[v0] 查询订阅会员，用户 ID:", user.id)
  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")

  console.log("[v0] 订阅查询结果:", {
    count: subscriptions?.length || 0,
    subscriptions: subscriptions,
    error: subscriptionError,
  })

  if (subscriptionError) {
    // 忽略表不存在的错误，继续返回普通用户
    const errorCode = subscriptionError.code || ''
    const errorMessage = subscriptionError.message || JSON.stringify(subscriptionError)
    
    console.error("[v0] 查询订阅会员错误详情:", {
      code: errorCode,
      message: errorMessage,
      fullError: subscriptionError,
    })
    
    // PGRST301 或 42P01 表示表不存在
    if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
      console.warn("[v0] subscriptions 表不存在，跳过查询")
    } else if (errorCode === '42501' || errorMessage.includes('row-level security')) {
      console.warn("[v0] RLS 策略阻止查询，但继续检查数据")
      // RLS 错误，但可能数据存在，尝试其他方式查询
    } else {
      console.error("[v0] 查询订阅会员错误:", subscriptionError)
    }
  }

  // 检查是否有活跃且未过期的订阅
  const now = new Date()
  const activeSubscriptions = subscriptions?.filter(sub => {
    if (sub.status !== "active") return false
    
    // 如果有 expires_at 字段，检查是否过期
    if (sub.expires_at) {
      const expiresAt = new Date(sub.expires_at)
      if (expiresAt < now) {
        console.log(`[v0] 订阅已过期: ${sub.id}, 到期时间: ${expiresAt.toISOString()}`)
        // 自动更新过期订阅的状态
        // 注意：这里只是标记，实际清理由后台任务或下次查询时处理
        return false
      }
      return true
    }
    
    // 如果没有 expires_at，认为是有效的（兼容旧数据）
    return true
  }) || []

  // 如果有过期订阅，自动清理（更新状态为 expired）
  const expiredSubscriptions = subscriptions?.filter(sub => {
    if (sub.status !== "active") return false
    if (sub.expires_at) {
      const expiresAt = new Date(sub.expires_at)
      return expiresAt < now
    }
    return false
  }) || []

  if (expiredSubscriptions.length > 0) {
    console.log(`[v0] 发现 ${expiredSubscriptions.length} 个过期订阅，开始清理...`)
    for (const expiredSub of expiredSubscriptions) {
      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({
          status: "expired",
          updated_at: new Date().toISOString(),
        })
        .eq("id", expiredSub.id)
      
      if (updateError) {
        console.error(`[v0] 清理过期订阅失败: ${expiredSub.id}`, updateError)
      } else {
        console.log(`[v0] ✅ 已清理过期订阅: ${expiredSub.id}`)
      }
    }
  }

  // 找到最早到期的有效订阅（用于显示到期时间）
  const activeSubscription = activeSubscriptions.length > 0 
    ? activeSubscriptions.sort((a, b) => {
        const aExpires = a.expires_at ? new Date(a.expires_at).getTime() : Infinity
        const bExpires = b.expires_at ? new Date(b.expires_at).getTime() : Infinity
        return aExpires - bExpires
      })[0]
    : null
  
  if (activeSubscription) {
    console.log("[v0] 用户是订阅会员:", activeSubscription)
    const expiresAt = activeSubscription.expires_at ? new Date(activeSubscription.expires_at) : null
    return {
      type: "member",
      label: "会员",
      dailyLimit: Infinity,
      hasUnlimited: true,
      expiresAt: expiresAt || undefined,
    }
  }
  
  // 如果没有活跃订阅，但查询到了其他状态的订阅，记录日志
  if (subscriptions && subscriptions.length > 0) {
    console.log("[v0] 用户有订阅记录，但状态不是 active:", subscriptions.map(s => ({ id: s.id, status: s.status })))
  }

  // 登录但未付费的用户
  return {
    type: "free",
    label: "普通用户",
    dailyLimit: 10,
    hasUnlimited: false,
  }
}

/**
 * 获取用户今日已使用聊天次数
 */
export async function getTodayChatCount(userId: string | null): Promise<number> {
  if (!userId) {
    // 游客用户使用 localStorage 记录（仅在客户端）
    if (typeof window === "undefined") return 0
    // 使用与 incrementChatCount 相同的日期格式
    const today = new Date().toISOString().split("T")[0]
    const key = `chat_count_${today}`
    const count = parseInt(localStorage.getItem(key) || "0", 10)
    // 确保返回的值是有效的数字（防止 NaN 或负数）
    return isNaN(count) || count < 0 ? 0 : count
  }

  // 登录用户使用 Supabase 记录
  const supabase = createClient()
  const today = new Date().toISOString().split("T")[0]
  
  const { data, error } = await supabase
    .from("chat_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle()

  if (error) {
    // PGRST116 是"未找到记录"的错误，这是正常的
    if (error.code === 'PGRST116') {
      return 0
    }
    
    console.error("[v0] 查询聊天次数错误:", error)
    // 如果是表不存在的错误，提供友好提示并使用降级方案
    const errorCode = error.code || ''
    const errorMessage = error.message || JSON.stringify(error)
    
    if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
      console.warn("[v0] chat_usage 表不存在，使用 localStorage 作为降级方案")
      // 降级到 localStorage
      if (typeof window !== "undefined") {
        const key = `chat_count_${today}`
        return parseInt(localStorage.getItem(key) || "0", 10)
      }
      return 0
    }
  }

  return data?.count || 0
}

/**
 * 增加用户今日聊天次数
 */
export async function incrementChatCount(userId: string | null): Promise<void> {
  const today = new Date().toISOString().split("T")[0]

  if (!userId) {
    // 游客用户使用 localStorage（仅在客户端）
    if (typeof window === "undefined") return
    const key = `chat_count_${today}`
    const count = parseInt(localStorage.getItem(key) || "0", 10)
    localStorage.setItem(key, (count + 1).toString())
    return
  }

  // 登录用户使用 Supabase
  const supabase = createClient()
  
  // 先查询现有记录
  const { data: existing, error: queryError } = await supabase
    .from("chat_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle()

  if (queryError) {
    // PGRST116 是"未找到记录"的错误，这是正常的
    if (queryError.code === 'PGRST116') {
      // 继续执行插入逻辑
    } else {
      const errorCode = queryError.code || ''
      const errorMessage = queryError.message || JSON.stringify(queryError)
      
      // PGRST301 或 42P01 表示表不存在，使用降级方案
      if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
        console.warn("[v0] chat_usage 表不存在，使用 localStorage 作为降级方案")
        // 降级到 localStorage
        if (typeof window !== "undefined") {
          const key = `chat_count_${today}`
          const count = parseInt(localStorage.getItem(key) || "0", 10)
          localStorage.setItem(key, (count + 1).toString())
          console.log("[v0] 使用 localStorage 记录聊天次数:", count + 1)
        }
        return
      } else {
        console.error("[v0] 查询聊天次数错误:", queryError)
      }
    }
  }

  if (existing) {
    // 更新现有记录
    const { error: updateError } = await supabase
      .from("chat_usage")
      .update({ count: existing.count + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("date", today)
    
    if (updateError) {
      console.error("[v0] 更新聊天次数失败:", updateError)
    } else {
      console.log("[v0] 聊天次数已更新:", existing.count + 1)
    }
  } else {
    // 插入新记录
    const { error: insertError } = await supabase
      .from("chat_usage")
      .insert({
        user_id: userId,
        date: today,
        count: 1,
      })
    
    if (insertError) {
      const errorCode = insertError.code || ''
      const errorMessage = insertError.message || JSON.stringify(insertError)
      
      // 如果是表不存在的错误，使用降级方案
      if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
        console.warn("[v0] chat_usage 表不存在，使用 localStorage 作为降级方案")
        // 表不存在时，使用 localStorage 作为降级方案
        if (typeof window !== "undefined") {
          const key = `chat_count_${today}`
          const count = parseInt(localStorage.getItem(key) || "0", 10)
          localStorage.setItem(key, (count + 1).toString())
          console.log("[v0] 使用 localStorage 记录聊天次数:", count + 1)
        }
      } else {
        console.error("[v0] 插入聊天次数失败:", insertError)
      }
    } else {
      console.log("[v0] 聊天次数已创建: 1")
    }
  }
}

