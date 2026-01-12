"use client"

import { useEffect, useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Loader2 } from "lucide-react"
import { getUserMembership, type MembershipInfo } from "@/lib/membership"
import { checkMembershipStatus } from "@/lib/check-membership"

function AccountContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<any>(null)
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [diagnostics, setDiagnostics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // 获取支付成功参数
  const requestId = searchParams.get("request_id")
  const checkoutId = searchParams.get("checkout_id")
  const orderId = searchParams.get("order_id")
  const subscriptionId = searchParams.get("subscription_id")
  const productId = searchParams.get("product_id")
  const signature = searchParams.get("signature")

  useEffect(() => {
    // 检查用户登录状态和会员信息
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      
      if (user) {
        // 如果检测到支付成功参数，尝试手动同步订阅
        if (subscriptionId || orderId) {
          console.log("[v0] 检测到支付成功参数，尝试同步订阅...")
          console.log("[v0] subscriptionId:", subscriptionId, "orderId:", orderId)
          try {
            const syncResponse = await fetch("/api/sync-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                subscriptionId: subscriptionId || orderId,
                productId: productId,
              }),
            })
            const syncData = await syncResponse.json()
            console.log("[v0] 订阅同步结果:", syncData)
            
            // 同步后重新获取会员信息
            const updatedMembership = await getUserMembership()
            setMembership(updatedMembership)
            console.log("[v0] 会员信息已更新:", updatedMembership)
          } catch (error) {
            console.error("[v0] 同步订阅失败:", error)
          }
        }

        const membershipInfo = await getUserMembership()
        setMembership(membershipInfo)
        
        // 运行诊断检查
        const diag = await checkMembershipStatus()
        setDiagnostics(diag)
        console.log("[v0] 会员诊断信息:", diag)
      }
      
      setLoading(false)
    }
    
    loadData()
  }, [supabase, subscriptionId, orderId, productId])

  // 判断支付是否成功（有这些参数说明支付成功）
  const isPaymentSuccess = !!checkoutId || !!orderId || !!subscriptionId

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>需要登录</CardTitle>
            <CardDescription>请先登录以查看账户信息</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/")} className="w-full">
              返回首页
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">账户中心</h1>
          <p className="text-muted-foreground">管理你的订阅和支付信息</p>
        </div>

        {/* 支付成功提示 */}
        {isPaymentSuccess && (
          <Card className="border-green-500 bg-green-50 dark:bg-green-950">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <CardTitle className="text-green-900 dark:text-green-100">
                  支付成功！
                </CardTitle>
              </div>
              <CardDescription className="text-green-700 dark:text-green-300">
                感谢你的支持，你的订阅/购买已激活
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                {checkoutId && (
                  <p>
                    <span className="font-medium">支付 ID:</span> {checkoutId}
                  </p>
                )}
                {orderId && (
                  <p>
                    <span className="font-medium">订单 ID:</span> {orderId}
                  </p>
                )}
                {subscriptionId && (
                  <p>
                    <span className="font-medium">订阅 ID:</span> {subscriptionId}
                  </p>
                )}
                {productId && (
                  <p>
                    <span className="font-medium">产品 ID:</span> {productId}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 用户信息 */}
        <Card>
          <CardHeader>
            <CardTitle>账户信息</CardTitle>
            <CardDescription>你的账户基本信息</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-sm text-muted-foreground">邮箱:</span>
              <p className="font-medium">{user.email}</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">会员类型:</span>
              <div className="mt-1">
                {membership && (
                  <Badge variant={membership.type === "lifetime" ? "default" : membership.type === "member" ? "secondary" : "outline"}>
                    {membership.label}
                  </Badge>
                )}
              </div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">用户 ID:</span>
              <p className="font-medium text-xs font-mono">{user.id}</p>
            </div>
          </CardContent>
        </Card>

        {/* 订阅信息 */}
        <Card>
          <CardHeader>
            <CardTitle>订阅状态</CardTitle>
            <CardDescription>查看你的订阅和购买记录</CardDescription>
          </CardHeader>
          <CardContent>
            {diagnostics ? (
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium mb-2">数据库检查：</p>
                  <div className="space-y-2 pl-4">
                    <div>
                      <span className={diagnostics.checks?.oneTimePurchases?.exists ? "text-green-600" : "text-red-600"}>
                        {diagnostics.checks?.oneTimePurchases?.exists ? "✅" : "❌"}
                      </span>
                      {" "}一次性支付表: {diagnostics.checks?.oneTimePurchases?.exists ? "存在" : "不存在或错误"}
                      {diagnostics.checks?.oneTimePurchases?.error && (
                        <p className="text-xs text-red-500 pl-6">{diagnostics.checks.oneTimePurchases.error}</p>
                      )}
                      {diagnostics.checks?.oneTimePurchases?.count > 0 && (
                        <p className="text-xs text-muted-foreground pl-6">记录数: {diagnostics.checks.oneTimePurchases.count}</p>
                      )}
                    </div>
                    <div>
                      <span className={diagnostics.checks?.subscriptions?.exists ? "text-green-600" : "text-red-600"}>
                        {diagnostics.checks?.subscriptions?.exists ? "✅" : "❌"}
                      </span>
                      {" "}订阅表: {diagnostics.checks?.subscriptions?.exists ? "存在" : "不存在或错误"}
                      {diagnostics.checks?.subscriptions?.error && (
                        <p className="text-xs text-red-500 pl-6">{diagnostics.checks.subscriptions.error}</p>
                      )}
                      {diagnostics.checks?.subscriptions?.count > 0 && (
                        <p className="text-xs text-muted-foreground pl-6">记录数: {diagnostics.checks.subscriptions.count}</p>
                      )}
                    </div>
                    <div>
                      <span className={diagnostics.checks?.chatUsage?.exists ? "text-green-600" : "text-red-600"}>
                        {diagnostics.checks?.chatUsage?.exists ? "✅" : "❌"}
                      </span>
                      {" "}聊天使用表: {diagnostics.checks?.chatUsage?.exists ? "存在" : "不存在或错误"}
                      {diagnostics.checks?.chatUsage?.error && (
                        <p className="text-xs text-red-500 pl-6">{diagnostics.checks.chatUsage.error}</p>
                      )}
                      {diagnostics.checks?.chatUsage?.todayCount > 0 && (
                        <p className="text-xs text-muted-foreground pl-6">今日使用: {diagnostics.checks.chatUsage.todayCount} 次</p>
                      )}
                    </div>
                  </div>
                </div>
                {(!diagnostics.checks?.oneTimePurchases?.exists || !diagnostics.checks?.subscriptions?.exists) && (
                  <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                    <p className="text-xs text-yellow-800 dark:text-yellow-200">
                      ⚠️ 数据库表未创建。请在 Supabase Dashboard 的 SQL Editor 中执行 <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded">supabase-schema.sql</code> 文件中的 SQL 语句。
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>加载中...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 操作按钮 */}
        <div className="flex gap-4">
          <Button onClick={() => router.push("/")} variant="outline">
            返回首页
          </Button>
          <Button onClick={() => router.push("/pricing")}>
            管理订阅
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    }>
      <AccountContent />
    </Suspense>
  )
}

