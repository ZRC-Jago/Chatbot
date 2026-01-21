"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2 } from "lucide-react"
import { formatHistoryTime } from "@/lib/chat-history"

type Artwork = {
  id: string
  user_name: string
  prompt: string | null
  file_url: string
  file_type: "image" | "video"
  created_at: string
}

export default function ArtworkDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [artwork, setArtwork] = useState<Artwork | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadArtwork = async () => {
      try {
        const response = await fetch(`/api/artworks/${params.id}`)
        if (!response.ok) {
          throw new Error("加载失败")
        }
        const result = await response.json()
        setArtwork(result.data)
      } catch (error) {
        console.error("加载作品失败:", error)
      } finally {
        setLoading(false)
      }
    }

    if (params.id) {
      loadArtwork()
    }
  }, [params.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!artwork) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">作品不存在</p>
          <Button onClick={() => router.push("/community")}>
            返回社区
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 头部 */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回
          </Button>
        </div>
      </div>

      {/* 内容 */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="bg-card rounded-lg border p-6">
          {/* 作品 */}
          <div className="mb-6">
            {artwork.file_type === "image" ? (
              <img
                src={artwork.file_url}
                alt={artwork.prompt || "作品"}
                className="w-full rounded-lg"
              />
            ) : (
              <video
                src={artwork.file_url}
                controls
                className="w-full rounded-lg"
              />
            )}
          </div>

          {/* 信息 */}
          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-1">作者</p>
              <p className="text-lg font-medium">{artwork.user_name}</p>
            </div>

            {artwork.prompt && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">提示词</p>
                <p className="text-base">{artwork.prompt}</p>
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-1">发布时间</p>
              <p className="text-sm">
                {formatHistoryTime(new Date(artwork.created_at).getTime())}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
