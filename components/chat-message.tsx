"use client"

import { cn } from "@/lib/utils"
import { Volume2, VolumeX, Download, Share2, Loader2 } from "lucide-react"
import { useState, useRef } from "react"

interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  characterId?: string
  characterName?: string // 角色名字（聊天室模式）
  showCharacterName?: boolean // 是否显示角色名字
  imageUrl?: string // 图片 URL（生图模式生成的图片，或视觉模式用户上传的图片）
  userImageUrl?: string // 用户上传的图片 URL（视觉模式、视频模式）
  videoUrl?: string // 视频 URL（视频模式生成的视频）
  messageId?: string // 消息 ID（用于判断是否为生图模式欢迎消息）
  prompt?: string | null // 提示词（用于分享到社区）
  userId?: string | null // 用户ID（用于TTS API）
}

export function ChatMessage({ role, content, characterId, characterName, showCharacterName, imageUrl, userImageUrl, videoUrl, messageId, prompt, userId }: ChatMessageProps) {
  // 过滤掉CHARACTER标记
  const cleanContent = content.replace(/CHARACTER:[^|\n]*\|[^|\n]*\|/g, "").trim()
  const isAssistant = role === "assistant"
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  const [imageLoadError, setImageLoadError] = useState(false)
  const [userImageLoadError, setUserImageLoadError] = useState(false)
  const [videoLoadError, setVideoLoadError] = useState(false)
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
        body: JSON.stringify({ 
          text: content, 
          characterId,
          userId: userId || null
        }),
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

  // 分享到社区
  const handleShare = async () => {
    if (!imageUrl && !videoUrl) return

    try {
      setIsSharing(true)

      // 1. 下载文件
      const fileUrl = imageUrl || videoUrl
      const response = await fetch(fileUrl!)
      if (!response.ok) {
        throw new Error("下载文件失败")
      }

      const blob = await response.blob()
      const file = new File([blob], `artwork.${imageUrl ? "png" : "mp4"}`, {
        type: imageUrl ? "image/png" : "video/mp4",
      })

      // 2. 上传到 Supabase Storage
      const formData = new FormData()
      formData.append("file", file)
      formData.append("file_type", imageUrl ? "image" : "video")

      const uploadResponse = await fetch("/api/artworks/upload", {
        method: "POST",
        body: formData,
      })

      if (!uploadResponse.ok) {
        let errorMessage = "上传失败"
        try {
          const errorData = await uploadResponse.json()
          errorMessage = errorData.error || errorMessage
          // 如果是 bucket 未创建的错误，提供更详细的提示
          if (errorData.code === "BUCKET_NOT_FOUND") {
            throw new Error(
              "Storage bucket 未创建。\n\n" +
              "请在 Supabase Dashboard 中：\n" +
              "1. 进入 Storage 页面\n" +
              "2. 创建名为 'artworks' 的 bucket\n" +
              "3. 设置为公开访问\n\n" +
              "详细步骤请查看 COMMUNITY_SETUP.md 文件"
            )
          }
        } catch (parseError) {
          // 如果响应不是 JSON，尝试读取文本
          const errorText = await uploadResponse.text()
          errorMessage = errorText || `HTTP ${uploadResponse.status}: ${uploadResponse.statusText}`
        }
        throw new Error(errorMessage)
      }

      const uploadData = await uploadResponse.json()

      // 3. 保存到数据库
      const createResponse = await fetch("/api/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt || null, // 视频可能没有提示词
          file_url: uploadData.file_url,
          file_path: uploadData.file_path, // 传递文件路径，方便后续删除
          file_type: imageUrl ? "image" : "video",
        }),
      })

      if (!createResponse.ok) {
        const errorData = await createResponse.json()
        throw new Error(errorData.error || "保存失败")
      }

      alert("分享成功！作品已发布到社区")
    } catch (error) {
      console.error("分享失败:", error)
      alert(`分享失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setIsSharing(false)
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
        {/* 用户上传的图片（视觉模式、视频模式） */}
        {userImageUrl && !isAssistant && (
          <div className="mb-2">
            {!userImageLoadError ? (
              <img 
                src={userImageUrl} 
                alt="Uploaded image" 
                className="max-w-full max-h-[400px] rounded-lg shadow-sm object-contain"
                onError={(e) => {
                  console.error("图片加载失败:", userImageUrl)
                  setUserImageLoadError(true)
                  e.currentTarget.style.display = "none"
                }}
              />
            ) : (
              <div className="max-w-full p-6 bg-muted rounded-lg border border-border flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground text-center">
                  图片无法加载
                </p>
              </div>
            )}
          </div>
        )}
        {/* AI生成的视频（视频模式） */}
        {videoUrl && isAssistant && (
          <div className="mb-2 relative">
            {!videoLoadError ? (
              <video 
                src={videoUrl} 
                controls
                className="max-w-full max-h-[500px] rounded-lg shadow-sm"
                onError={(e) => {
                  console.error("视频加载失败:", videoUrl)
                  setVideoLoadError(true)
                  e.currentTarget.style.display = "none"
                }}
              >
                您的浏览器不支持视频播放
              </video>
            ) : (
              <div className="max-w-full p-8 bg-muted rounded-lg border border-border flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground text-center">
                  视频无法加载
                </p>
                <p className="text-xs text-muted-foreground/70 text-center">
                  视频链接可能已过期或无法访问
                </p>
              </div>
            )}
            {!videoLoadError && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <a
                  href={videoUrl}
                  download={`video-${Date.now()}.mp4`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  下载视频
                </a>
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      分享中...
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      分享到社区
                    </>
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  视频将在24小时后自动删除
                </span>
              </div>
            )}
          </div>
        )}
        {/* AI生成的图片（生图模式）或视觉模式返回的图片 */}
        {imageUrl && isAssistant && !videoUrl && (
          <div className="mb-2 relative">
            {!imageLoadError ? (
              <img 
                src={imageUrl} 
                alt="Generated image" 
                className="max-w-full rounded-lg shadow-sm"
                onError={(e) => {
                  console.error("图片加载失败:", imageUrl)
                  setImageLoadError(true)
                  e.currentTarget.style.display = "none"
                }}
              />
            ) : (
              <div className="max-w-full p-8 bg-muted rounded-lg border border-border flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-muted-foreground text-center">
                  图片无法加载
                </p>
                <p className="text-xs text-muted-foreground/70 text-center">
                  图片链接可能已过期或无法访问
                </p>
              </div>
            )}
            {!imageLoadError && (
              <div className="mt-2">
                <button
                  onClick={handleShare}
                  disabled={isSharing}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      分享中...
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      分享到社区
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
        {cleanContent && (
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{cleanContent}</p>
        )}

        {/* 图片和视频模式下不显示语音播放按钮，生图、视觉、视频助手的欢迎消息也不显示 */}
        {isAssistant && content && !imageUrl && !videoUrl && messageId !== "welcome-image" && messageId !== "welcome-vision" && messageId !== "welcome-video" && (
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
