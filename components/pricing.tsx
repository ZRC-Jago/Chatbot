"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, ArrowLeft } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { getUserMembership, type MembershipInfo } from "@/lib/membership"
import { useRouter } from "next/navigation"

interface PricingPlan {
  id: string
  name: string
  price: string
  description: string
  features: string[]
  productId: string
  type: "subscription" | "one-time"
}

const plans: PricingPlan[] = [
  {
    id: "subscription",
    name: "订阅付费",
    price: "$5",
    description: "按月订阅，随时取消",
    features: [
      "无限对话次数",
      "优先响应速度",
      "高级功能访问",
      "随时取消订阅",
    ],
    productId: "prod_3KsUwoLdRYf0AJt13cRaks",
    type: "subscription",
  },
  {
    id: "one-time",
    name: "一次性支付",
    price: "$20",
    description: "一次性付费，永久访问",
    features: [
      "永久访问权限",
      "所有高级功能",
      "无月费压力",
      "终身技术支持",
    ],
    productId: "prod_1M6yb3ZGysGUHKNwnlMV8P",
    type: "one-time",
  },
]

export function Pricing() {
  const [loading, setLoading] = useState<string | null>(null)
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    // 加载会员信息
    getUserMembership().then(setMembership)
    
    // 诊断：检查按钮是否正确渲染
    console.log("[v0] 前端: Pricing 组件已加载")
    
    // 检查是否有 JavaScript 错误
    window.addEventListener('error', (event) => {
      console.error("[v0] 前端: 全局错误:", event.error)
    })
    
    // 检查未捕获的 Promise 错误
    window.addEventListener('unhandledrejection', (event) => {
      console.error("[v0] 前端: 未处理的 Promise 错误:", event.reason)
    })
  }, [])

  const handleCheckout = async (productId: string) => {
    console.log("[v0] 前端: handleCheckout 被调用, productId:", productId)
    
    try {
      // 检查用户是否登录
      console.log("[v0] 前端: 检查用户登录状态...")
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        console.warn("[v0] 前端: 用户未登录")
        alert("请先登录后再进行支付")
        return
      }

      console.log("[v0] 前端: 用户已登录:", user.id)
      setLoading(productId)

      // 调用 checkout API
      console.log("[v0] 前端: 开始创建 checkout session, productId:", productId)
      const response = await fetch(`/api/checkout?product_id=${productId}`)
      
      console.log("[v0] 前端: API 响应状态:", response.status)
      
      const data = await response.json()
      console.log("[v0] 前端: API 响应数据:", data)

      if (!response.ok) {
        const errorMsg = data.error || data.details || "创建支付会话失败"
        console.error("[v0] 前端: API 错误:", errorMsg)
        throw new Error(errorMsg)
      }

      // 跳转到支付页面
      if (data.checkoutUrl) {
        console.log("[v0] 前端: 跳转到支付页面:", data.checkoutUrl)
        window.location.href = data.checkoutUrl
      } else {
        throw new Error("未收到支付链接")
      }
    } catch (error) {
      console.error("[v0] 前端: 支付错误:", error)
      const errorMessage = error instanceof Error ? error.message : "支付失败，请稍后重试"
      alert(`支付失败: ${errorMessage}\n\n请检查:\n1. 是否已登录\n2. 网络连接是否正常\n3. 查看浏览器控制台获取更多信息`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            // 使用 router.push 而不是 router.back()，避免会话丢失
            router.push("/")
          }}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
      </div>
      
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-4">选择你的计划</h2>
        <p className="text-muted-foreground">选择最适合你的付费方式</p>
        {membership && (
          <div className="mt-4">
            <Badge variant={membership.type === "lifetime" ? "default" : membership.type === "member" ? "secondary" : "outline"}>
              当前状态: {membership.label}
            </Badge>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        {plans.map((plan) => (
          <Card key={plan.id} className="flex flex-col">
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                {plan.type === "subscription" && (
                  <span className="text-muted-foreground">/月</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-3">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log("[v0] 前端: 按钮被点击, productId:", plan.productId)
                  console.log("[v0] 前端: 按钮状态 - loading:", loading, "membership:", membership?.type)
                  console.log("[v0] 前端: 按钮是否禁用:", loading === plan.productId || (plan.type === "subscription" && membership?.type === "member") || (plan.type === "one-time" && membership?.type === "lifetime"))
                  handleCheckout(plan.productId)
                }}
                disabled={loading === plan.productId || (plan.type === "one-time" && membership?.type === "lifetime")}
                type="button"
              >
                {loading === plan.productId 
                  ? "处理中..." 
                  : (plan.type === "subscription" && membership?.type === "member")
                    ? membership?.expiresAt 
                      ? `续费 (到期: ${new Date(membership.expiresAt).toLocaleDateString('zh-CN')})`
                      : "续费"
                    : (plan.type === "one-time" && membership?.type === "lifetime")
                      ? "已拥有"
                      : "立即支付"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}

