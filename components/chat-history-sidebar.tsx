"use client"

import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Trash2, X } from "lucide-react"
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
import { loadChatHistories, deleteChatHistory, formatHistoryTime, type ChatHistory } from "@/lib/chat-history"
import { getCharacterById, type Character } from "@/lib/characters"
import { cn } from "@/lib/utils"

interface ChatHistorySidebarProps {
  userId: string | null
  isOpen: boolean
  onClose: () => void
  onSelectHistory: (history: ChatHistory) => void
  currentHistoryId?: string
  mode?: "companion" | "image" | "vision" | "video" // 当前模式，用于过滤历史记录
}

export function ChatHistorySidebar({
  userId,
  isOpen,
  onClose,
  onSelectHistory,
  currentHistoryId,
  mode = "companion",
}: ChatHistorySidebarProps) {
  const [histories, setHistories] = useState<ChatHistory[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // 加载历史记录，并根据模式过滤
  useEffect(() => {
    if (isOpen) {
      const loadedHistories = loadChatHistories(userId)
      // 只显示当前模式的历史记录
      const filteredHistories = loadedHistories.filter(h => h.mode === mode)
      setHistories(filteredHistories)
    }
  }, [userId, isOpen, mode])

  // 刷新历史记录
  const refreshHistories = () => {
    const loadedHistories = loadChatHistories(userId)
    // 只显示当前模式的历史记录
    const filteredHistories = loadedHistories.filter(h => h.mode === mode)
    setHistories(filteredHistories)
  }

  // 删除历史记录
  const handleDelete = (historyId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteTargetId(historyId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (deleteTargetId && deleteChatHistory(userId, deleteTargetId)) {
      refreshHistories()
    }
    setDeleteDialogOpen(false)
    setDeleteTargetId(null)
  }

  // 获取角色信息
  const getCharacter = (characterId: string): Character | null => {
    try {
      return getCharacterById(characterId)
    } catch {
      return null
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/20 z-40 lg:hidden"
        onClick={onClose}
      />
      
      {/* 侧边栏 */}
      <div
        className={cn(
          "fixed left-0 top-0 h-full w-80 bg-background border-r border-border z-50",
          "flex flex-col shadow-lg",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {mode === "image" ? "创作历史" : mode === "vision" ? "识图历史" : mode === "video" ? "视频历史" : "聊天历史"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 历史记录列表 */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {histories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                <p className="text-sm">暂无聊天历史</p>
                <p className="text-xs mt-1">开始新的对话吧</p>
              </div>
            ) : (
              histories.map((history) => {
                const character = getCharacter(history.characterId)
                const isActive = history.id === currentHistoryId
                
                return (
                  <div
                    key={history.id}
                    onClick={() => {
                      onSelectHistory(history)
                      onClose()
                    }}
                    className={cn(
                      "group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                      "hover:bg-muted/50",
                      isActive && "bg-muted"
                    )}
                  >
                    {/* 角色头像或模式标识 */}
                    <Avatar className="h-10 w-10 shrink-0">
                      {history.mode === "companion" ? (
                        <>
                          <AvatarImage src={character?.avatar} alt={character?.name} />
                          <AvatarFallback>
                            {character?.name?.charAt(0) || "?"}
                          </AvatarFallback>
                        </>
                      ) : (
                        <AvatarFallback className="bg-primary/10 text-primary font-bold">
                          {history.mode === "image" ? "创" : history.mode === "vision" ? "识" : "视"}
                        </AvatarFallback>
                      )}
                    </Avatar>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {history.mode === "companion" 
                            ? (character?.name || history.characterName)
                            : (history.mode === "image" ? "创作" : history.mode === "vision" ? "识图" : "视频")
                          }
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => handleDelete(history.id, e)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {history.preview || "新对话"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatHistoryTime(history.updatedAt)}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </ScrollArea>
      </div>

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除聊天记录</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条聊天记录吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
