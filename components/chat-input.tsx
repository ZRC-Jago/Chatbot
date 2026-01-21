"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { SendHorizontal, Image as ImageIcon, X } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"

interface ChatInputProps {
  onSend: (message: string, imageUrl?: string, videoOptions?: { imageSize: string; duration: number }) => void
  disabled?: boolean
  placeholder?: string
  modeSelector?: React.ReactNode // 模式选择器（放在输入框左上角）
  mode?: "companion" | "image" | "vision" | "video" // 当前模式
}

export function ChatInput({ onSend, disabled, placeholder = "在这里倾诉你的心声...", modeSelector, mode = "companion" }: ChatInputProps) {
  const [input, setInput] = useState("")
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // 视频模式参数
  const [videoImageSize, setVideoImageSize] = useState("1280x720")
  const [videoDuration, setVideoDuration] = useState(5)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSend = () => {
    if ((input.trim() || selectedImage) && !disabled) {
      const defaultText = mode === "vision" ? "请分析这张图片" : mode === "video" ? "请生成视频" : ""
      const videoOptions = mode === "video" ? {
        imageSize: videoImageSize,
        duration: videoDuration,
      } : undefined
      onSend(input.trim() || defaultText, selectedImage || undefined, videoOptions)
      setInput("")
      setSelectedImage(null)
      setImagePreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // 检查文件类型
      if (!file.type.startsWith("image/")) {
        alert("请选择图片文件")
        return
      }
      // 检查文件大小（限制为10MB）
      if (file.size > 10 * 1024 * 1024) {
        alert("图片大小不能超过10MB")
        return
      }
      // 转换为base64
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setSelectedImage(result)
        setImagePreview(result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  return (
    <div className="relative">
      {/* 视频模式：特殊布局 - 图片预览和模式选择器绝对定位，参数和输入框在正常流 */}
      {mode === "video" ? (
        <div className="relative">
          {/* 图片预览（绝对定位，在模式选择器上方） */}
          {imagePreview && (
            <div className="absolute -top-[233px] left-4 z-10">
              <div className="relative inline-block max-w-full">
                <img 
                  src={imagePreview} 
                  alt="预览" 
                  className="max-w-[250px] max-h-[180px] w-auto h-auto rounded-lg object-contain shadow-sm border border-border"
                  style={{ aspectRatio: "auto" }}
                />
                <button
                  onClick={handleRemoveImage}
                  className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90 shadow-md z-10"
                  aria-label="移除图片"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* 模式选择器（绝对定位，固定在输入框左上角） */}
          {modeSelector && (
            <div className="absolute -top-10 left-4 flex items-center gap-2 z-10">
              {modeSelector}
            </div>
          )}
          
          <div className="space-y-3">
            {/* 视频模式参数选择 */}
            {imagePreview && (
              <div className="flex flex-col gap-3 p-3 bg-muted/50 rounded-lg max-w-[250px]">
              <div className="flex items-center gap-3">
                <Label htmlFor="video-size" className="text-sm font-medium whitespace-nowrap">尺寸/比例:</Label>
                <Select value={videoImageSize} onValueChange={setVideoImageSize}>
                  <SelectTrigger id="video-size" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1280x720">1280x720 (16:9)</SelectItem>
                    <SelectItem value="720x1280">720x1280 (9:16)</SelectItem>
                    <SelectItem value="1024x1024">1024x1024 (1:1)</SelectItem>
                    <SelectItem value="1920x1080">1920x1080 (16:9)</SelectItem>
                    <SelectItem value="1080x1920">1080x1920 (9:16)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor="video-duration" className="text-sm font-medium whitespace-nowrap">视频时长:</Label>
                <Select value={videoDuration.toString()} onValueChange={(value) => setVideoDuration(parseInt(value))}>
                  <SelectTrigger id="video-duration" className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((duration) => (
                      <SelectItem key={duration} value={duration.toString()}>
                        {duration} 秒
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          
          {/* 输入框 */}
          <div className="relative flex items-end gap-2 p-3 bg-white/80 backdrop-blur-md border border-border rounded-2xl shadow-lg transition-all focus-within:ring-2 focus-within:ring-primary/20">
            {/* 图片上传按钮 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              id="image-upload"
            />
            <label htmlFor="image-upload" className="cursor-pointer">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0 rounded-xl"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }}
              >
                <ImageIcon className="h-5 w-5" />
              </Button>
            </label>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={placeholder}
              className="flex-1 max-h-32 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-1.5 text-[15px] placeholder:text-muted-foreground/60"
              disabled={disabled}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!input.trim() && !selectedImage) || disabled}
              className="h-9 w-9 shrink-0 rounded-xl transition-transform active:scale-95"
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
          </div>
        </div>
      ) : (
        <>
          {/* 输入框容器（相对定位，为模式选择器和图片预览提供定位基准） */}
          <div className="relative">
            {/* 识图模式：图片预览（绝对定位，在模式选择器上方） */}
            {mode === "vision" && imagePreview && (
              <div className="absolute -top-[233px] left-4 z-10">
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="预览" 
                    className="max-w-[250px] max-h-[180px] w-auto h-auto rounded-lg object-contain shadow-sm"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90 shadow-md"
                    aria-label="移除图片"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            
            {/* 模式选择器：固定在输入框左上角 */}
            {modeSelector && (
              <div className="absolute -top-10 left-4 flex items-center gap-2 z-10">
                {modeSelector}
              </div>
            )}
            
            {/* 输入框 */}
            <div className="relative flex items-end gap-2 p-3 bg-white/80 backdrop-blur-md border border-border rounded-2xl shadow-lg transition-all focus-within:ring-2 focus-within:ring-primary/20">
            {/* 识图模式下显示图片上传按钮 */}
            {mode === "vision" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                  id="image-upload"
                />
                <label htmlFor="image-upload" className="cursor-pointer">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0 rounded-xl"
                    disabled={disabled}
                    onClick={(e) => {
                      e.preventDefault()
                      fileInputRef.current?.click()
                    }}
                  >
                    <ImageIcon className="h-5 w-5" />
                  </Button>
                </label>
              </>
            )}
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={placeholder}
              className="flex-1 max-h-32 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-1.5 text-[15px] placeholder:text-muted-foreground/60"
              disabled={disabled}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={(!input.trim() && !selectedImage) || disabled}
              className="h-9 w-9 shrink-0 rounded-xl transition-transform active:scale-95"
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
          </div>
        </>
      )}
    </div>
  )
}
