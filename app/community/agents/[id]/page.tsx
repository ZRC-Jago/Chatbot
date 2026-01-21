"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Download, User, Calendar, TrendingUp } from "lucide-react"
import Link from "next/link"
import { useRouter, useParams } from "next/navigation"
import { VOICE_OPTIONS } from "@/lib/characters"
import { createClient } from "@/lib/supabase/client"

type SharedAgent = {
  id: string
  agent_id: string
  creator_id: string
  creator_name: string | null
  creator_email: string | null
  name: string
  description: string | null
  usage_count: number
  created_at: string
  custom_agents: {
    id: string
    name: string
    avatar: string | null
    voice: string
    welcome_message: string | null
    description: string | null
    system_prompt: string
  } | null
}

export default function AgentDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const [agent, setAgent] = useState<SharedAgent | null>(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [usingAgent, setUsingAgent] = useState(false)

  const agentId = params?.id as string

  // 加载用户信息
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [supabase])

  // 加载智能体详情
  useEffect(() => {
    const loadAgent = async () => {
      try {
        setLoading(true)
        // 直接通过ID获取分享的智能体
        const response = await fetch(`/api/agents/shared/${agentId}`)
        if (!response.ok) {
          throw new Error("加载失败")
        }

        const result = await response.json()
        if (result.data) {
          setAgent(result.data)
        }
      } catch (error) {
        console.error("加载智能体详情失败:", error)
      } finally {
        setLoading(false)
      }
    }

    if (agentId) {
      loadAgent()
    }
  }, [agentId])

  // 使用智能体
  const handleUseAgent = async () => {
    if (!user) {
      router.push("/?error=login_required")
      return
    }

    if (!agent) return

    try {
      setUsingAgent(true)
      const response = await fetch(`/api/agents/shared/${agent.id}/use`, {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "使用失败")
      }

      const { data } = await response.json()

      // 跳转到聊天页面并使用该智能体
      if (typeof window !== "undefined") {
        localStorage.setItem("selected_character_id", data.id)
        router.push("/")
      }
    } catch (error) {
      console.error("使用智能体失败:", error)
      alert(error instanceof Error ? error.message : "使用失败，请重试")
    } finally {
      setUsingAgent(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!agent || !agent.custom_agents) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <Link href="/community/agents">
            <Button variant="ghost" size="icon" className="mb-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="text-center py-12">
            <p className="text-muted-foreground">智能体不存在或已被删除</p>
          </div>
        </div>
      </div>
    )
  }

  const agentInfo = agent.custom_agents

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/community/agents">
            <Button variant="ghost" size="icon" className="mb-4">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-start gap-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl flex-shrink-0">
              {agentInfo.avatar || agentInfo.name[0]}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{agentInfo.name}</h1>
              {agent.description && (
                <p className="text-muted-foreground mb-4">{agent.description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>
                    {agent.creator_name || agent.creator_email?.split("@")[0] || "匿名用户"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(agent.created_at).toLocaleDateString("zh-CN")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span>{agent.usage_count || 0} 次使用</span>
                </div>
              </div>
            </div>
            <Button
              onClick={handleUseAgent}
              disabled={usingAgent}
              size="lg"
            >
              {usingAgent ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  使用中...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  使用此智能体
                </>
              )}
            </Button>
          </div>
        </div>

        {/* 详细信息 */}
        <div className="space-y-6">
          {/* 基本信息 */}
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">基本信息</h2>
            <div className="space-y-3">
              <div>
                <span className="text-sm text-muted-foreground">音色</span>
                <p className="font-medium">
                  {VOICE_OPTIONS.find((v) => v.value === agentInfo.voice)?.label || agentInfo.voice}
                </p>
              </div>
              {agentInfo.welcome_message && (
                <div>
                  <span className="text-sm text-muted-foreground">欢迎消息</span>
                  <p className="font-medium">{agentInfo.welcome_message}</p>
                </div>
              )}
            </div>
          </div>

          {/* 系统提示词预览 */}
          {agentInfo.system_prompt && (
            <div className="border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">系统提示词</h2>
              <div className="bg-muted/50 rounded-md p-4">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {agentInfo.system_prompt}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
