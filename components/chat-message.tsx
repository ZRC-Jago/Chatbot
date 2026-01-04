"use client"

import { cn } from "@/lib/utils"
import { Volume2, VolumeX } from "lucide-react"
import { useState, useRef } from "react"

interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
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
        body: JSON.stringify({ text: content }),
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
      <div
        className={cn(
          "max-w-[85%] px-5 py-3 shadow-sm relative",
          isAssistant
            ? "bg-white text-foreground rounded-2xl rounded-tl-none border border-border"
            : "bg-primary text-primary-foreground rounded-2xl rounded-tr-none",
        )}
      >
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{content}</p>

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
