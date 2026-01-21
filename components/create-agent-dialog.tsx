"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { VOICE_OPTIONS } from "@/lib/characters"
import { Loader2 } from "lucide-react"

interface CreateAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function CreateAgentDialog({ open, onOpenChange, onSuccess }: CreateAgentDialogProps) {
  const [name, setName] = useState("")
  const [avatar, setAvatar] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [voice, setVoice] = useState("")
  const [welcomeMessage, setWelcomeMessage] = useState("")
  const [description, setDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    // 验证必填字段
    if (!name.trim()) {
      setError("请输入智能体名字")
      return
    }
    if (!systemPrompt.trim()) {
      setError("请输入系统提示词")
      return
    }
    if (!voice) {
      setError("请选择音色")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          avatar: avatar.trim() || undefined,
          system_prompt: systemPrompt.trim(),
          voice,
          welcome_message: welcomeMessage.trim() || undefined,
          description: description.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "创建失败")
      }

      // 重置表单
      setName("")
      setAvatar("")
      setSystemPrompt("")
      setVoice("")
      setWelcomeMessage("")
      setDescription("")
      setError("")

      // 关闭对话框
      onOpenChange(false)

      // 触发成功回调
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false)
      // 延迟重置表单，避免关闭动画时看到表单清空
      setTimeout(() => {
        setName("")
        setAvatar("")
        setSystemPrompt("")
        setVoice("")
        setWelcomeMessage("")
        setDescription("")
        setError("")
      }, 200)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>创建自定义智能体</DialogTitle>
          <DialogDescription>
            创建一个属于你的智能体，设置它的名字、提示词和音色
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">名字 *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：健康生活小助手"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="avatar">头像文字（可选）</Label>
            <Input
              id="avatar"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              placeholder="例如：健（如果不填，将使用名字第一个字）"
              maxLength={10}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              用于在角色选择界面显示，建议1-2个字符
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">系统提示词 *</Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="例如：你是「健康生活小助手」，一个帮助用户建立可持续健康习惯的智能体..."
              rows={8}
              required
              disabled={isSubmitting}
              className="font-mono text-sm"
            />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                定义智能体的角色、行为和对话风格
              </p>
              <div className="text-xs bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md border border-blue-200 dark:border-blue-900">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">💡 工具使用提示：</p>
                <p className="text-blue-800 dark:text-blue-200">
                  你的智能体可以自动使用以下工具：<strong>时间查询</strong>、<strong>BMI计算</strong>、<strong>卡路里估算</strong>。
                  只需在系统提示词中描述智能体的用途，它会根据用户问题自动选择合适的工具。
                </p>
                <p className="text-blue-700 dark:text-blue-300 mt-1 text-[11px]">
                  例如：如果创建健康助手，可以在提示词中说明"当用户询问BMI或卡路里时，使用工具进行精确计算"
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice">音色 *</Label>
            <Select value={voice} onValueChange={setVoice} disabled={isSubmitting}>
              <SelectTrigger id="voice" className="w-full">
                <SelectValue placeholder="请选择音色" />
              </SelectTrigger>
              <SelectContent>
                {VOICE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="welcomeMessage">欢迎消息（可选）</Label>
            <Textarea
              id="welcomeMessage"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              placeholder="例如：你好，我是健康生活小助手，有什么可以帮助你的吗？"
              rows={3}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              如果不填，将使用默认格式：你好，我是{name || "[名字]"}。有什么可以帮助你的吗？
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">描述（可选）</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="例如：专业的健康生活助手，提供饮食、运动、睡眠建议"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              用于分享到社区时显示
            </p>
          </div>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
