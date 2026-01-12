import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Webhook Response Interface
 * 
 * Represents the structure of incoming webhook events from Creem.
 */
export interface WebhookResponse {
  id: string
  eventType: string
  object: {
    request_id: string
    object: string
    id: string
    customer: {
      id: string
    }
    product: {
      id: string
      billing_type: string
    }
    status: string
    metadata: any
    // 订阅相关字段
    current_period_end?: string // ISO 8601 格式的到期时间
    expires_at?: string // 到期时间（如果 Creem 提供）
  }
}

/**
 * POST /api/webhook
 * 
 * Processes incoming webhook events from Creem's payment system.
 * Handles both one-time payments and subscription lifecycle events.
 * 
 * Event Types Handled:
 * 1. One-Time Payments:
 *    - checkout.completed: Payment successful, fulfill purchase
 *    - payment.completed: Alternative event type for one-time payments
 *    - purchase.completed: Alternative event type for one-time purchases
 * 
 * 2. Subscriptions:
 *    - subscription.active: Subscription activated
 *    - subscription.paid: New subscription or successful renewal
 *    - subscription.update: Subscription status updated
 *    - subscription.canceled: Subscription cancellation requested
 *    - subscription.expired: Subscription ended (payment failed or period ended)
 * 
 * Note: Creem 的统计系统可能只统计订阅类型的支付，一次性支付可能不会在 Creem 后台显示统计信息。
 * 但 webhook 仍然会正常触发，支付记录会保存到 Supabase 数据库中。
 */
export async function POST(req: NextRequest) {
  console.log("[v0] ========== Webhook 请求收到 ==========")
  console.log("[v0] 请求方法:", req.method)
  console.log("[v0] 请求 URL:", req.url)
  console.log("[v0] 请求头:", Object.fromEntries(req.headers.entries()))
  
  try {
    const body = await req.text()
    console.log("[v0] 请求体 (原始):", body.substring(0, 500))
    
    let webhook: WebhookResponse
    try {
      webhook = JSON.parse(body) as WebhookResponse
    } catch (parseError) {
      console.error("[v0] ❌ JSON 解析错误:", parseError)
      return NextResponse.json(
        { error: "无效的 JSON 格式" },
        { status: 400 }
      )
    }
    
    console.log("[v0] Webhook 解析成功:", JSON.stringify(webhook, null, 2))

    // 确定支付类型
    const isSubscription = webhook.object.product.billing_type === "recurring"
    
    // 获取用户 ID：优先从 metadata 获取，如果没有则从 request_id 获取
    // 对于订阅，metadata.userId 应该存在
    // 对于一次性支付，request_id 应该包含用户 ID，但 metadata.userId 也可能存在
    const userId = webhook.object.metadata?.userId || webhook.object.request_id

    console.log(`[v0] ========== Webhook 收到 ==========`)
    console.log(`[v0] 事件类型: ${webhook.eventType}`)
    console.log(`[v0] 支付类型: ${isSubscription ? '订阅' : '一次性'}`)
    console.log(`[v0] 产品 ID: ${webhook.object.product.id}`)
    console.log(`[v0] 订单 ID: ${webhook.object.id}`)
    console.log(`[v0] billing_type: ${webhook.object.product.billing_type}`)
    console.log(`[v0] metadata:`, JSON.stringify(webhook.object.metadata, null, 2))
    console.log(`[v0] request_id: ${webhook.object.request_id}`)
    console.log(`[v0] 用户 ID (metadata.userId): ${webhook.object.metadata?.userId}`)
    console.log(`[v0] 用户 ID (request_id): ${webhook.object.request_id}`)
    console.log(`[v0] 最终用户 ID: ${userId}`)
    console.log(`[v0] =================================`)

    if (!userId) {
      console.error("[v0] ❌ Webhook 中缺少用户 ID")
      console.error("[v0] Webhook 完整数据:", JSON.stringify(webhook, null, 2))
      return NextResponse.json(
        { error: "缺少用户信息" },
        { status: 400 }
      )
    }

    // 尝试使用 Admin 客户端（绕过 RLS），如果没有配置则使用普通客户端
    let supabase = createAdminClient()
    if (!supabase) {
      console.warn('[v0] ⚠️ 使用 anon key，如果遇到 RLS 错误，请配置 SUPABASE_SERVICE_ROLE_KEY')
      supabase = await createClient()
    } else {
      console.log('[v0] ✅ 使用 Service Role Key (Admin 客户端)')
    }

    if (!isSubscription) {
      /**
       * 一次性支付流程
       * 注意：Creem 对于一次性支付可能使用不同的事件类型
       * 常见的事件类型：checkout.completed, payment.completed, purchase.completed
       */
      console.log(`[v0] ========== 一次性支付处理 ==========`)
      console.log(`[v0] 收到的事件类型: ${webhook.eventType}`)
      console.log(`[v0] billing_type: ${webhook.object.product.billing_type}`)
      
      const oneTimeEventTypes = ["checkout.completed", "payment.completed", "purchase.completed"]
      
      if (oneTimeEventTypes.includes(webhook.eventType)) {
        const productId = webhook.object.product.id
        const providerCustomerId = webhook.object.customer.id

        console.log(`[v0] ✅ 识别为一次性支付事件: ${webhook.eventType}`)
        console.log(`[v0] 产品 ID: ${productId}`)
        console.log(`[v0] 用户 ID: ${userId}`)
        console.log(`[v0] 客户 ID: ${providerCustomerId}`)
        console.log(`[v0] 订单 ID: ${webhook.object.id}`)
        console.log(`[v0] 订单状态: ${webhook.object.status}`)

        // 验证用户 ID 格式（UUID）
        if (!userId || typeof userId !== 'string' || userId.length < 10) {
          console.error(`[v0] ❌ 用户 ID 格式无效: ${userId}`)
          console.error(`[v0] ❌ 无法存储支付记录，请检查 webhook 数据`)
          return NextResponse.json(
            { error: "用户 ID 格式无效", userId: userId },
            { status: 400 }
          )
        }

        // 检查数据库中是否已存在该订单（防止重复插入）
        const { data: existingPurchase, error: checkError } = await supabase
          .from("one_time_purchases")
          .select("id")
          .eq("id", webhook.object.id)
          .single()

        if (checkError && checkError.code !== 'PGRST116') { // PGRST116 表示未找到记录，这是正常的
          console.error(`[v0] ❌ 检查现有订单时出错:`, checkError)
        }

        if (existingPurchase) {
          console.log(`[v0] ⚠️ 订单 ${webhook.object.id} 已存在，跳过插入`)
          console.log(`[v0] ✅ 支付记录已存在于数据库中`)
          return NextResponse.json({
            success: true,
            message: "订单已存在，无需重复处理",
            orderId: webhook.object.id,
          })
        }

        console.log(`[v0] 📝 准备插入支付记录到数据库...`)

        // 存储支付信息到 Supabase 数据库
        const { data: insertedData, error } = await supabase
          .from("one_time_purchases")
          .insert({
            id: webhook.object.id,
            user_id: userId,
            product_id: productId,
            provider_customer_id: providerCustomerId,
            status: "completed",
            created_at: new Date().toISOString(),
          })
          .select()

        if (error) {
          console.error(`[v0] ❌ 存储一次性支付记录错误:`)
          console.error(`[v0] 错误代码: ${error.code}`)
          console.error(`[v0] 错误消息: ${error.message}`)
          console.error(`[v0] 错误详情:`, JSON.stringify(error, null, 2))
          console.error(`[v0] 尝试插入的数据:`, {
            id: webhook.object.id,
            user_id: userId,
            product_id: productId,
            provider_customer_id: providerCustomerId,
            status: "completed",
          })
          
          // 检查是否是表不存在的错误
          const errorCode = error.code || ''
          const errorMessage = error.message || JSON.stringify(error)
          if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
            console.error(`[v0] ⚠️ 警告: one_time_purchases 表不存在！`)
            console.error(`[v0] ⚠️ 请在 Supabase Dashboard 的 SQL Editor 中执行 supabase-schema.sql 创建表`)
            console.error(`[v0] ⚠️ 否则支付记录将无法保存，用户将无法获得会员权限`)
            return NextResponse.json(
              { 
                error: "数据库表不存在",
                details: "请执行 supabase-schema.sql 创建表",
                orderId: webhook.object.id,
              },
              { status: 500 }
            )
          }
          
          // 检查是否是外键约束错误（用户不存在）
          if (errorCode === '23503' || errorMessage.includes('foreign key') || errorMessage.includes('user_id')) {
            console.error(`[v0] ❌ 用户 ID ${userId} 不存在于 auth.users 表中`)
            console.error(`[v0] ❌ 这可能是 webhook 中的 userId 不正确`)
            return NextResponse.json(
              { 
                error: "用户不存在",
                userId: userId,
                orderId: webhook.object.id,
              },
              { status: 400 }
            )
          }
          
          // 其他错误，返回 500 让 Creem 重试
          return NextResponse.json(
            { 
              error: "数据库存储失败",
              details: errorMessage,
              orderId: webhook.object.id,
            },
            { status: 500 }
          )
        } else {
          console.log(`[v0] ✅ 用户 ${userId} 完成一次性支付: ${productId}`)
          console.log(`[v0] ✅ 支付记录已成功存储到 Supabase one_time_purchases 表`)
          console.log(`[v0] ✅ 插入的数据:`, JSON.stringify(insertedData, null, 2))
          console.log(`[v0] ======================================`)
        }
      } else {
        console.warn(`[v0] ⚠️ 未处理的一次性支付事件类型: ${webhook.eventType}`)
        console.warn(`[v0] ⚠️ 支持的事件类型: ${oneTimeEventTypes.join(', ')}`)
        console.warn(`[v0] ⚠️ 完整 webhook 数据:`, JSON.stringify(webhook, null, 2))
        console.warn(`[v0] ⚠️ 这可能是 Creem 使用了不同的事件类型，需要更新代码以支持`)
        console.warn(`[v0] ======================================`)
        
        // 返回成功，但记录警告
        return NextResponse.json({
          success: true,
          warning: `未处理的事件类型: ${webhook.eventType}`,
          message: "Webhook 已收到，但事件类型未匹配，请检查代码",
        })
      }
    } else {
      /**
       * 订阅流程
       */
      const productId = webhook.object.product.id
      const providerCustomerId = webhook.object.customer.id
      const subscriptionStatus = webhook.object.status || "active"

      // 处理订阅激活事件（subscription.active 或 subscription.paid）
      if (webhook.eventType === "subscription.active" || webhook.eventType === "subscription.paid") {
        // 计算到期时间
        // 优先使用 webhook 提供的到期时间，如果没有则默认30天后
        let expiresAt: string | null = null
        if (webhook.object.current_period_end) {
          expiresAt = webhook.object.current_period_end
        } else if (webhook.object.expires_at) {
          expiresAt = webhook.object.expires_at
        } else {
          // 如果没有提供到期时间，默认30天后（月订阅）
          const defaultExpiry = new Date()
          defaultExpiry.setMonth(defaultExpiry.getMonth() + 1)
          expiresAt = defaultExpiry.toISOString()
        }

        console.log(`[v0] 订阅到期时间: ${expiresAt}`)

        // 存储订阅信息到 Supabase（支持续费：如果已存在则更新到期时间）
        const { error } = await supabase
          .from("subscriptions")
          .upsert({
            id: webhook.object.id,
            user_id: userId,
            product_id: productId,
            status: "active",
            provider_customer_id: providerCustomerId,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "id",
          })

        if (error) {
          console.error("❌ 存储订阅记录错误:", error)
          console.error("错误详情:", JSON.stringify(error, null, 2))
          
          // 检查是否是表不存在的错误
          const errorCode = error.code || ''
          const errorMessage = error.message || JSON.stringify(error)
          if (errorCode === 'PGRST301' || errorCode === '42P01' || errorMessage.includes('does not exist') || errorMessage.includes('relation')) {
            console.error("⚠️ 警告: subscriptions 表不存在！")
            console.error("⚠️ 请在 Supabase Dashboard 的 SQL Editor 中执行 supabase-schema.sql 创建表")
            console.error("⚠️ 否则订阅记录将无法保存，用户将无法获得会员权限")
          }
        } else {
          console.log(`✅ 用户 ${userId} 订阅已激活: ${productId}`)
          console.log(`✅ 订阅记录已存储到 Supabase subscriptions 表`)
        }
      }

      // 处理订阅更新事件（subscription.update）
      if (webhook.eventType === "subscription.update") {
        // 只有当状态为 active 时才更新
        if (subscriptionStatus === "active") {
          // 计算到期时间
          let expiresAt: string | null = null
          if (webhook.object.current_period_end) {
            expiresAt = webhook.object.current_period_end
          } else if (webhook.object.expires_at) {
            expiresAt = webhook.object.expires_at
          } else {
            // 如果没有提供到期时间，默认30天后（月订阅）
            const defaultExpiry = new Date()
            defaultExpiry.setMonth(defaultExpiry.getMonth() + 1)
            expiresAt = defaultExpiry.toISOString()
          }

          console.log(`[v0] 订阅更新到期时间: ${expiresAt}`)

          const { error } = await supabase
            .from("subscriptions")
            .upsert({
              id: webhook.object.id,
              user_id: userId,
              product_id: productId,
              status: "active",
              provider_customer_id: providerCustomerId,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: "id",
            })

          if (error) {
            console.error("❌ 更新订阅记录错误:", error)
          } else {
            console.log(`✅ 订阅状态已更新: ${productId}, 状态: active`)
          }
        }
      }

      if (webhook.eventType === "subscription.canceled") {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", webhook.object.id)

        if (error) {
          console.error("更新订阅状态错误:", error)
        }

        console.log(`订阅已取消: ${webhook.object.id}`)
      }

      if (webhook.eventType === "subscription.expired") {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: "expired",
            updated_at: new Date().toISOString(),
          })
          .eq("id", webhook.object.id)

        if (error) {
          console.error("更新订阅状态错误:", error)
        }

        console.log(`订阅已过期: ${webhook.object.id}`)
      }
    }

    // 确认 webhook 处理成功
    console.log("[v0] ✅ Webhook 处理完成")
    console.log("[v0] ======================================")
    return NextResponse.json({
      success: true,
      message: "Webhook 处理成功",
    })
  } catch (error) {
    console.error("[v0] ❌ Webhook 处理错误:", error)
    if (error instanceof Error) {
      console.error("[v0] 错误消息:", error.message)
      console.error("[v0] 错误堆栈:", error.stack)
    } else {
      console.error("[v0] 错误对象:", JSON.stringify(error, null, 2))
    }
    console.error("[v0] ======================================")
    return NextResponse.json(
      { error: "Webhook 处理失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}


