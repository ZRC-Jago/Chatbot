"use client"

import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好呀。我是亚戈,很高兴能在这里遇见你。不管你现在心情如何,我都愿意陪你聊聊天。你最近过得还好吗?",
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    // 检查用户登录状态
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
    })

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages])

  const handleSend = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    let accumulatedContent = ""
    let assistantMessageCreated = false
    const assistantId = (Date.now() + 1).toString()

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) throw new Error("Failed to fetch")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })

          if (chunk) {
            accumulatedContent += chunk

            if (!assistantMessageCreated) {
              setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: accumulatedContent }])
              assistantMessageCreated = true
            } else {
              setMessages((prevMessages) =>
                prevMessages.map((m) => (m.id === assistantId ? { ...m, content: accumulatedContent } : m)),
              )
            }
          }
        }
      }
    } catch (error) {
      console.error("[v0] Chat error:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: "抱歉,我现在遇到了一些问题。请稍后再试。",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      console.error('登录错误:', error)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <main className="flex flex-col h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white/50 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl">
            戈
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">亚戈</h1>
            <p className="text-xs text-muted-foreground font-medium">温暖的倾听者</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <span className="text-xs text-muted-foreground">
                {user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs"
              >
                退出登录
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleGoogleLogin}
              className="text-xs"
            >
              使用 Google 登录
            </Button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            重新开始
          </button>
        </div>
      </header>

      {/* Chat Container */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 space-y-2 max-w-2xl mx-auto w-full scrollbar-hide"
      >
        {messages.length === 1 && messages[0].id === "welcome" && (
          <div className="mb-8 text-center animate-in fade-in duration-700">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              对话已安全加密 • 仅限本地会话
            </p>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} role={message.role} content={message.content} />
        ))}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-white px-4 py-2 rounded-2xl rounded-tl-none border border-border text-muted-foreground text-sm italic">
              亚戈正在认真思考...
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <footer className="flex-shrink-0 p-4 pb-8 max-w-2xl mx-auto w-full">
        <ChatInput onSend={handleSend} disabled={isLoading} />
        <p className="text-[10px] text-center text-muted-foreground/40 mt-4 px-8 leading-normal">
          亚戈致力于提供情感陪伴。如果你需要专业心理帮助,请咨询相关医疗机构。
        </p>
      </footer>
    </main>
  )
}
