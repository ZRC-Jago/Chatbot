"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowLeft, Download, Search, User } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  } | null
}

export default function CommunityAgentsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [agents, setAgents] = useState<SharedAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState("")
  const [user, setUser] = useState<any>(null)
  const [usingAgentId, setUsingAgentId] = useState<string | null>(null)
  const observerTarget = useRef<HTMLDivElement>(null)

  // 加载用户信息
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })
  }, [supabase])

  // 加载智能体列表
  const loadAgents = useCallback(async (pageNum: number, reset: boolean = false) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "20",
      })

      const response = await fetch(`/api/agents/shared?${params.toString()}`)
      if (!response.ok) {
        throw new Error("加载失败")
      }

      const result = await response.json()
      const newAgents = result.data || []

      if (reset) {
        setAgents(newAgents)
      } else {
        setAgents((prev) => [...prev, ...newAgents])
      }

      setHasMore(newAgents.length === 20)
    } catch (error) {
      console.error("加载智能体失败:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始加载
  useEffect(() => {
    loadAgents(1, true)
  }, [loadAgents])

  // 无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          setPage((prev) => {
            const nextPage = prev + 1
            loadAgents(nextPage, false)
            return nextPage
          })
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loading, loadAgents])

  // 使用智能体（复制到自己的列表）
  const handleUseAgent = async (sharedAgentId: string) => {
    if (!user) {
      router.push("/?error=login_required")
      return
    }

    try {
      setUsingAgentId(sharedAgentId)
      const response = await fetch(`/api/agents/shared/${sharedAgentId}/use`, {
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
      setUsingAgentId(null)
    }
  }

  // 过滤智能体（根据搜索关键词）
  const filteredAgents = agents.filter((agent) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      agent.name.toLowerCase().includes(query) ||
      agent.description?.toLowerCase().includes(query) ||
      agent.creator_name?.toLowerCase().includes(query)
    )
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/community">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">社区智能体</h1>
              <p className="text-sm text-muted-foreground">发现和使用其他用户分享的智能体</p>
            </div>
          </div>
        </div>

        {/* 搜索框 */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="搜索智能体名称、描述或创建者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* 智能体列表 */}
        {loading && agents.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery ? "没有找到匹配的智能体" : "还没有分享的智能体"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredAgents.map((agent) => {
                const agentInfo = agent.custom_agents
                if (!agentInfo) return null

                return (
                  <div
                    key={agent.id}
                    className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                        {agentInfo.avatar || agentInfo.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{agentInfo.name}</h3>
                        {agent.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {agent.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-muted-foreground mb-3">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3" />
                        <span className="truncate">
                          {agent.creator_name || agent.creator_email?.split("@")[0] || "匿名用户"}
                        </span>
                      </div>
                      <div>
                        音色: {VOICE_OPTIONS.find((v) => v.value === agentInfo.voice)?.label || agentInfo.voice}
                      </div>
                      <div>
                        使用次数: {agent.usage_count || 0}
                      </div>
                      <div>
                        分享于: {new Date(agent.created_at).toLocaleDateString("zh-CN")}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => router.push(`/community/agents/${agent.id}`)}
                      >
                        查看详情
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleUseAgent(agent.id)}
                        disabled={usingAgentId === agent.id}
                      >
                        {usingAgentId === agent.id ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            使用中...
                          </>
                        ) : (
                          <>
                            <Download className="h-3 w-3 mr-1" />
                            使用
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 无限滚动触发器 */}
            {hasMore && !searchQuery && (
              <div ref={observerTarget} className="flex justify-center py-4">
                {loading && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
