"use client"

import { useState, useRef, useEffect } from "react"
import { Character, CHARACTERS } from "@/lib/characters"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ChatRoomMessage {
  id: string
  role: "user" | "assistant"
  content: string
  characterId?: string // 如果是角色消息，记录是哪个角色
  characterName?: string // 角色名字
}

interface ChatRoomProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  membership: { type: string; hasUnlimited: boolean } | null
}

export function ChatRoom({ open, onOpenChange, membership }: ChatRoomProps) {
  const [invitedCharacters, setInvitedCharacters] = useState<string[]>([]) // 已邀请的角色ID列表
  const [messages, setMessages] = useState<ChatRoomMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isInRoom, setIsInRoom] = useState(false) // 是否已进入聊天室
  const scrollRef = useRef<HTMLDivElement>(null)
  const sendMessageLockRef = useRef(false)

  // 检查是否是会员
  const isMember = membership && (membership.type === "member" || membership.type === "lifetime")

  // 滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages])

  // 进入聊天室
  const handleEnterRoom = () => {
    if (invitedCharacters.length === 0) {
      alert("请至少选择一个角色加入聊天室")
      return
    }

    setIsInRoom(true)
    const characterNames = invitedCharacters
      .map(id => CHARACTERS.find(c => c.id === id)?.name)
      .filter(Boolean)
      .join("、")

    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: `欢迎来到聊天室！${characterNames}已经加入。大家可以自由聊天了！`,
        characterId: "system",
        characterName: "系统",
      },
    ])
  }

  // 发送消息
  const handleSend = async (content: string) => {
    if (sendMessageLockRef.current || isLoading) {
      return
    }

    sendMessageLockRef.current = true
    setIsLoading(true)

    const userMessage: ChatRoomMessage = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])

    try {
      const response = await fetch("/api/chat-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
            characterId: m.characterId,
            characterName: m.characterName,
          })),
          invitedCharacters,
        }),
      })

      if (!response.ok) {
        throw new Error("请求失败")
      }

      if (!response.body) {
        throw new Error("响应体为空")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let currentCharacterId = ""
      let currentCharacterName = ""
      let accumulatedContent: Record<string, string> = {} // 每个角色的内容
      let assistantMessageCreated: Record<string, boolean> = {} // 每个角色是否已创建消息
      const assistantId = Date.now().toString()

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmedLine = line.trim()

          // 检查是否是角色标识
          if (trimmedLine.startsWith("CHARACTER:")) {
            const parts = trimmedLine.substring(10).split("|")
            if (parts.length >= 2) {
              currentCharacterId = parts[0]
              currentCharacterName = parts[1]
              if (!accumulatedContent[currentCharacterId]) {
                accumulatedContent[currentCharacterId] = ""
              }
              assistantMessageCreated[currentCharacterId] = false
            }
            continue
          }

          // 处理普通内容（不是 CHARACTER: 开头的）
          if (trimmedLine && currentCharacterId) {
            if (!accumulatedContent[currentCharacterId]) {
              accumulatedContent[currentCharacterId] = ""
            }
            accumulatedContent[currentCharacterId] += trimmedLine

            if (!assistantMessageCreated[currentCharacterId]) {
              setMessages((prev) => [
                ...prev,
                {
                  id: assistantId + currentCharacterId,
                  role: "assistant",
                  content: accumulatedContent[currentCharacterId],
                  characterId: currentCharacterId,
                  characterName: currentCharacterName,
                },
              ])
              assistantMessageCreated[currentCharacterId] = true
            } else {
              setMessages((prevMessages) =>
                prevMessages.map((m) =>
                  m.id === assistantId + currentCharacterId
                    ? { ...m, content: accumulatedContent[currentCharacterId] }
                    : m
                )
              )
            }
          }
        }
      }
    } catch (error) {
      console.error("[ChatRoom] Error:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `抱歉，发送消息时出错：${errorMessage}`,
          characterId: "system",
          characterName: "系统",
        },
      ])
    } finally {
      setIsLoading(false)
      sendMessageLockRef.current = false
    }
  }

  // 切换角色选择
  const toggleCharacter = (characterId: string) => {
    setInvitedCharacters((prev) =>
      prev.includes(characterId)
        ? prev.filter((id) => id !== characterId)
        : [...prev, characterId]
    )
  }

  // 关闭聊天室时重置状态
  const handleClose = (open: boolean) => {
    onOpenChange(open)
    if (!open) {
      setIsInRoom(false)
      setInvitedCharacters([])
      setMessages([])
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>聊天室</DialogTitle>
          {!isMember && (
            <p className="text-sm text-muted-foreground">
              此功能仅限会员使用，请先升级会员
            </p>
          )}
        </DialogHeader>

        {!isInRoom ? (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">选择要邀请的角色</h3>
              <p className="text-sm text-muted-foreground mb-4">
                选择你想要一起聊天的角色，至少选择一个
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {CHARACTERS.map((character) => (
                <div
                  key={character.id}
                  className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                    invitedCharacters.includes(character.id)
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                  onClick={() => isMember && toggleCharacter(character.id)}
                >
                  <Checkbox
                    checked={invitedCharacters.includes(character.id)}
                    onCheckedChange={() => isMember && toggleCharacter(character.id)}
                    disabled={!isMember}
                  />
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                    {character.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{character.name}</div>
                    <div className="text-xs text-muted-foreground">{character.description}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                onClick={handleEnterRoom}
                disabled={!isMember || invitedCharacters.length === 0}
              >
                进入聊天室
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* 聊天区域 */}
            <ScrollArea className="flex-1 px-4 py-6" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex flex-col gap-1">
                    {message.characterName && message.role === "assistant" && (
                      <div className="text-xs text-muted-foreground px-2">
                        {message.characterName}
                      </div>
                    )}
                    <ChatMessage
                      role={message.role}
                      content={message.content}
                      characterId={message.characterId}
                    />
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white px-4 py-2 rounded-2xl rounded-tl-none border border-border text-muted-foreground text-sm italic">
                      正在思考...
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* 输入区域 */}
            <div className="border-t p-4">
              <ChatInput onSend={handleSend} disabled={isLoading || !isMember} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

