"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { SendHorizontal } from "lucide-react"

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [input, setInput] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim())
      setInput("")
    }
  }

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit"
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [input])

  return (
    <div className="relative flex items-end gap-2 p-3 bg-white/80 backdrop-blur-md border border-border rounded-2xl shadow-lg transition-all focus-within:ring-2 focus-within:ring-primary/20">
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
        placeholder="在这里倾诉你的心声..."
        className="flex-1 max-h-32 bg-transparent border-none focus:ring-0 focus:outline-none resize-none py-1.5 text-[15px] placeholder:text-muted-foreground/60"
        disabled={disabled}
      />
      <Button
        size="icon"
        onClick={handleSend}
        disabled={!input.trim() || disabled}
        className="h-9 w-9 shrink-0 rounded-xl transition-transform active:scale-95"
      >
        <SendHorizontal className="h-5 w-5" />
      </Button>
    </div>
  )
}
