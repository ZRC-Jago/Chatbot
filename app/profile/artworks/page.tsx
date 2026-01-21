"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Image, Video, Trash2, Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { formatHistoryTime } from "@/lib/chat-history"
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

type Artwork = {
  id: string
  user_name: string
  prompt: string | null
  file_url: string
  file_type: "image" | "video"
  created_at: string
}

export default function MyArtworksPage() {
  const router = useRouter()
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<"all" | "image" | "video">("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 加载我的作品
  const loadMyArtworks = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filter !== "all") {
        params.append("file_type", filter)
      }

      const response = await fetch(`/api/artworks/my?${params.toString()}`)
      if (!response.ok) {
        throw new Error("加载失败")
      }

      const result = await response.json()
      setArtworks(result.data || [])
    } catch (error) {
      console.error("加载作品失败:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMyArtworks()
  }, [filter])

  // 删除作品
  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/artworks/${id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        let errorMessage = "删除失败"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      // 从列表中移除
      setArtworks((prev) => prev.filter((a) => a.id !== id))
      setDeleteDialogOpen(false)
      setDeletingId(null)
    } catch (error) {
      console.error("删除作品失败:", error)
      alert(`删除失败：${error instanceof Error ? error.message : "未知错误"}`)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push("/")}
                className="h-8 w-8"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-2xl font-bold">我的作品</h1>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                全部
              </Button>
              <Button
                variant={filter === "image" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("image")}
              >
                <Image className="h-4 w-4 mr-1" />
                图片
              </Button>
              <Button
                variant={filter === "video" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("video")}
              >
                <Video className="h-4 w-4 mr-1" />
                视频
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* 作品列表 */}
      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : artworks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p>暂无作品</p>
            <Link href="/">
              <Button variant="outline" className="mt-4">
                去创作
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {artworks.map((artwork) => (
              <div
                key={artwork.id}
                className="group relative aspect-square rounded-lg overflow-hidden bg-muted"
              >
                <Link href={`/community/${artwork.id}`}>
                  {artwork.file_type === "image" ? (
                    <img
                      src={artwork.file_url}
                      alt={artwork.prompt || "作品"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={artwork.file_url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                    />
                  )}
                </Link>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                    {artwork.prompt && (
                      <p className="text-xs text-white/80 truncate mb-1">
                        {artwork.prompt}
                      </p>
                    )}
                    <p className="text-xs text-white/60">
                      {formatHistoryTime(new Date(artwork.created_at).getTime())}
                    </p>
                  </div>
                  <div className="absolute top-2 right-2">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setDeletingId(artwork.id)
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

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>撤回作品</AlertDialogTitle>
            <AlertDialogDescription>
              确定要撤回这个作品吗？此操作无法撤销，作品将从社区中删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingId(null)}>
              取消
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingId) {
                  handleDelete(deletingId)
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认撤回
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
