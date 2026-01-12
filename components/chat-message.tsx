"use client"

import { cn } from "@/lib/utils"
import { Volume2, VolumeX } from "lucide-react"
import { useState, useRef } from "react"

interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  characterId?: string
  characterName?: string // 角色名字（聊天室模式）
  showCharacterName?: boolean // 是否显示角色名字
}

export function ChatMessage({ role, content, characterId, characterName, showCharacterName }: ChatMessageProps) {
  // 过滤掉CHARACTER标记
  const cleanContent = content.replace(/CHARACTER:[^|\n]*\|[^|\n]*\|/g, "").trim()
  const isAssistant = role === "assistant"
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlayAudio = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause()
      setIsPlaying(false)
      return
    }

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content, characterId }),
      })

      if (!response.ok) {
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          const errorData = await response.json()
          throw new Error(errorData.error || "TTS service failed")
        } else {
          const errorText = await response.text()
          throw new Error(errorText || "TTS service failed")
        }
      }

      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      if (audioRef.current) {
        audioRef.current.pause()
      }

      const audio = new Audio(audioUrl)
      audioRef.current = audio

      audio.onended = () => {
        setIsPlaying(false)
        URL.revokeObjectURL(audioUrl)
      }

      audio.onerror = () => {
        setIsPlaying(false)
        URL.revokeObjectURL(audioUrl)
      }

      await audio.play()
      setIsPlaying(true)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      alert(
        `语音播放失败：${errorMessage}\n\n` +
          `如果显示"SILICONFLOW_API_KEY environment variable is not configured"，\n` +
          `请在 v0 界面左侧的 Vars 部分添加 SILICONFLOW_API_KEY 环境变量。`,
      )
      setIsPlaying(false)
    }
  }

  return (
    <div
      className={cn(
        "flex w-full mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300 group",
        isAssistant ? "justify-start" : "justify-end",
      )}
    >
      {showCharacterName && characterName && isAssistant && (
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm mr-2 shrink-0">
          {characterName.charAt(0)}
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-5 py-3 shadow-sm relative",
          isAssistant
            ? "bg-white text-foreground rounded-2xl rounded-tl-none border border-border"
            : "bg-primary text-primary-foreground rounded-2xl rounded-tr-none",
        )}
      >
        {showCharacterName && characterName && isAssistant && (
          <div className="text-xs text-muted-foreground mb-1 font-medium">{characterName}</div>
        )}
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{cleanContent}</p>

        {isAssistant && content && (
          <button
            onClick={handlePlayAudio}
            className="absolute -right-10 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-accent"
            aria-label={isPlaying ? "停止播放" : "播放语音"}
          >
            {isPlaying ? (
              <VolumeX className="w-5 h-5 text-muted-foreground animate-pulse" />
            ) : (
              <Volume2 className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}
