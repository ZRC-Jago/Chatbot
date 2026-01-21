"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Image, Video, Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { formatHistoryTime } from "@/lib/chat-history"

type Artwork = {
  id: string
  user_name: string
  prompt: string | null
  file_url: string
  file_type: "image" | "video"
  created_at: string
}

export default function CommunityPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [artworks, setArtworks] = useState<Artwork[]>([])
  const [filter, setFilter] = useState<"all" | "image" | "video">("all")
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [page, setPage] = useState(1)
  const observerTarget = useRef<HTMLDivElement>(null)

  // 加载作品列表
  const loadArtworks = useCallback(async (pageNum: number, reset: boolean = false) => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "20",
      })
      
      if (filter !== "all") {
        params.append("file_type", filter)
      }

      const response = await fetch(`/api/artworks?${params.toString()}`)
      if (!response.ok) {
        throw new Error("加载失败")
      }

      const result = await response.json()
      const newArtworks = result.data || []

      if (reset) {
        setArtworks(newArtworks)
      } else {
        setArtworks((prev) => [...prev, ...newArtworks])
      }

      setHasMore(result.pagination?.hasMore || false)
    } catch (error) {
      console.error("加载作品失败:", error)
    } finally {
      setLoading(false)
    }
  }, [filter])

  // 初始加载
  useEffect(() => {
    setPage(1)
    setArtworks([])
    loadArtworks(1, true)
  }, [filter])

  // 无限滚动
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          const nextPage = page + 1
          setPage(nextPage)
          loadArtworks(nextPage, false)
        }
      },
      { threshold: 0.1 }
    )

    const currentTarget = observerTarget.current
    if (currentTarget) {
      observer.observe(currentTarget)
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [hasMore, loading, page, loadArtworks])

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
              <div>
                <h1 className="text-2xl font-bold">社区</h1>
                <p className="text-sm text-muted-foreground">浏览其他用户分享的作品和智能体</p>
              </div>
            </div>
          </div>

          {/* 导航标签 */}
          <div className="flex gap-2 px-4 pb-4">
            <Link href="/community">
              <Button variant={pathname === "/community" ? "default" : "outline"} size="sm">
                作品
              </Button>
            </Link>
            <Link href="/community/agents">
              <Button variant={pathname === "/community/agents" ? "default" : "outline"} size="sm">
                智能体
              </Button>
            </Link>
          </div>

          {/* 作品筛选（仅在作品页面显示） */}
          {pathname === "/community" && (
            <div className="flex gap-2 px-4 pb-4">
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
          )}
        </div>
      </div>

      {/* 作品网格（仅在作品页面显示） */}
      {pathname === "/community" && (
        <div className="container mx-auto px-4 py-6">
          {loading && artworks.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : artworks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>暂无作品</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {artworks.map((artwork) => (
                  <Link
                    key={artwork.id}
                    href={`/community/${artwork.id}`}
                    className="group relative aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity"
                  >
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                        <p className="text-sm font-medium truncate">
                          {artwork.user_name}
                        </p>
                        {artwork.prompt && (
                          <p className="text-xs text-white/80 truncate mt-1">
                            {artwork.prompt}
                          </p>
                        )}
                        <p className="text-xs text-white/60 mt-1">
                          {formatHistoryTime(new Date(artwork.created_at).getTime())}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* 加载指示器 */}
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {/* 无限滚动触发器 */}
              <div ref={observerTarget} className="h-4" />
            </>
          )}
        </div>
      )}
    </div>
  )
}
