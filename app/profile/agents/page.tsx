"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Trash2, Edit2, Share2, X, Loader2, ArrowLeft, Plus } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreateAgentDialog } from "@/components/create-agent-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { VOICE_OPTIONS } from "@/lib/characters"

type Agent = {
  id: string
  name: string
  avatar: string | null
  system_prompt: string
  voice: string
  welcome_message: string | null
  description: string | null
  is_shared: boolean
  created_at: string
}

export default function MyAgentsPage() {
  const router = useRouter()
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 加载我的智能体
  const loadMyAgents = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/agents")
      if (!response.ok) {
        throw new Error("加载失败")
      }
      const { data } = await response.json()
      setAgents(data || [])
    } catch (error) {
      console.error("加载智能体失败:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMyAgents()
  }, [])

  // 删除智能体
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/agents/${id}`, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error("删除失败")
      }
      await loadMyAgents()
      setDeleteDialogOpen(false)
      setDeletingId(null)
    } catch (error) {
      console.error("删除智能体失败:", error)
      alert("删除失败，请重试")
    }
  }

  // 分享/取消分享智能体
  const handleShare = async (id: string, isShared: boolean) => {
    try {
      const response = await fetch(`/api/agents/${id}/share`, {
        method: isShared ? "DELETE" : "POST",
      })
      if (!response.ok) {
        throw new Error(isShared ? "取消分享失败" : "分享失败")
      }
      await loadMyAgents()
    } catch (error) {
      console.error("分享操作失败:", error)
      alert(isShared ? "取消分享失败，请重试" : "分享失败，请重试")
    }
  }

  // 编辑智能体
  const handleEdit = async (agent: Agent, formData: Partial<Agent>) => {
    try {
      setIsSubmitting(true)
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          avatar: formData.avatar,
          system_prompt: formData.system_prompt,
          voice: formData.voice,
          welcome_message: formData.welcome_message,
          description: formData.description,
        }),
      })
      if (!response.ok) {
        throw new Error("更新失败")
      }
      await loadMyAgents()
      setEditingAgent(null)
    } catch (error) {
      console.error("更新智能体失败:", error)
      alert("更新失败，请重试")
    } finally {
      setIsSubmitting(false)
    }
  }

  // 使用智能体（跳转到聊天页面并选择该智能体）
  const handleUse = (id: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("selected_character_id", id)
      router.push("/")
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold">我的智能体</h1>
              <p className="text-sm text-muted-foreground">管理你的自定义智能体</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            创建智能体
          </Button>
        </div>

        {/* 智能体列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">还没有创建任何智能体</p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              创建第一个智能体
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {agent.avatar || agent.name[0]}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-lg">{agent.name}</h3>
                        {agent.is_shared && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            已分享
                          </span>
                        )}
                      </div>
                      {agent.description && (
                        <p className="text-sm text-muted-foreground mb-2">{agent.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>音色: {VOICE_OPTIONS.find(v => v.value === agent.voice)?.label || agent.voice}</span>
                        <span>创建于: {new Date(agent.created_at).toLocaleDateString("zh-CN")}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUse(agent.id)}
                    >
                      使用
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingAgent(agent)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleShare(agent.id, agent.is_shared)}
                    >
                      {agent.is_shared ? (
                        <>
                          <X className="h-4 w-4 mr-1" />
                          取消分享
                        </>
                      ) : (
                        <>
                          <Share2 className="h-4 w-4 mr-1" />
                          分享
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeletingId(agent.id)
                        setDeleteDialogOpen(true)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建智能体对话框 */}
      <CreateAgentDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={loadMyAgents}
      />

      {/* 编辑智能体对话框 */}
      {editingAgent && (
        <EditAgentDialog
          agent={editingAgent}
          open={!!editingAgent}
          onOpenChange={(open) => !open && setEditingAgent(null)}
          onSuccess={loadMyAgents}
          onSubmit={handleEdit}
          isSubmitting={isSubmitting}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复，该智能体的聊天记录也会被保留但无法再使用该智能体。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingId(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingId && handleDelete(deletingId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// 编辑智能体对话框组件
function EditAgentDialog({
  agent,
  open,
  onOpenChange,
  onSuccess,
  onSubmit,
  isSubmitting,
}: {
  agent: Agent
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onSubmit: (agent: Agent, formData: Partial<Agent>) => Promise<void>
  isSubmitting: boolean
}) {
  const [name, setName] = useState(agent.name)
  const [avatar, setAvatar] = useState(agent.avatar || "")
  const [systemPrompt, setSystemPrompt] = useState(agent.system_prompt)
  const [voice, setVoice] = useState(agent.voice)
  const [welcomeMessage, setWelcomeMessage] = useState(agent.welcome_message || "")
  const [description, setDescription] = useState(agent.description || "")
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName(agent.name)
      setAvatar(agent.avatar || "")
      setSystemPrompt(agent.system_prompt)
      setVoice(agent.voice)
      setWelcomeMessage(agent.welcome_message || "")
      setDescription(agent.description || "")
      setError("")
    }
  }, [open, agent])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

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

    await onSubmit(agent, {
      name: name.trim(),
      avatar: avatar.trim() || undefined,
      system_prompt: systemPrompt.trim(),
      voice,
      welcome_message: welcomeMessage.trim() || undefined,
      description: description.trim() || undefined,
    })

    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>编辑智能体</DialogTitle>
          <DialogDescription>修改智能体的配置</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">名字 *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-avatar">头像文字（可选）</Label>
            <Input
              id="edit-avatar"
              value={avatar}
              onChange={(e) => setAvatar(e.target.value)}
              maxLength={10}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-systemPrompt">系统提示词 *</Label>
            <Textarea
              id="edit-systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={8}
              required
              disabled={isSubmitting}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-voice">音色 *</Label>
            <Select value={voice} onValueChange={setVoice} disabled={isSubmitting}>
              <SelectTrigger id="edit-voice" className="w-full">
                <SelectValue />
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
            <Label htmlFor="edit-welcomeMessage">欢迎消息（可选）</Label>
            <Textarea
              id="edit-welcomeMessage"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              rows={3}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">描述（可选）</Label>
            <Input
              id="edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
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
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
