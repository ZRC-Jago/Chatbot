"use client"

import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { getUserMembership, getTodayChatCount, incrementChatCount, type MembershipInfo } from "@/lib/membership"
import { CHARACTERS, getCharacterById, getDefaultCharacter, CHARACTER_STORAGE_KEY, getAllCharacters, getCharacterByIdAsync, convertAgentToCharacter, type Character } from "@/lib/characters"
import { CreateAgentDialog } from "@/components/create-agent-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { ChatHistorySidebar } from "@/components/chat-history-sidebar"
import { saveChatHistory, updateChatHistory, loadChatHistory, loadChatHistories, type ChatHistory } from "@/lib/chat-history"
import { History } from "lucide-react"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  characterId?: string // 聊天室模式：角色ID
  characterName?: string // 聊天室模式：角色名字
  imageUrl?: string // 图片 URL（创作模式生成的图片，或识图模式用户上传的图片）
  userImageUrl?: string // 用户上传的图片 URL（识图模式、视频模式）
  videoUrl?: string // 视频 URL（视频模式生成的视频）
}

export default function ChatPage() {
  // 始终使用默认角色作为初始值，避免 hydration mismatch
  // 在 useEffect 中从 localStorage 加载保存的角色
  const defaultCharacter = getDefaultCharacter()
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(defaultCharacter)
  const [isCharacterLoaded, setIsCharacterLoaded] = useState(false) // 标记是否已从 localStorage 加载
  
  // 陪伴模式的消息记录
  const [companionMessages, setCompanionMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: defaultCharacter.welcomeMessage,
      characterId: defaultCharacter.id,
      characterName: defaultCharacter.name,
    },
  ])
  // 创作模式的消息记录
  const [imageMessages, setImageMessages] = useState<Message[]>([])
  // 识图模式的消息记录
  const [visionMessages, setVisionMessages] = useState<Message[]>([])
  // 视频模式的消息记录
  const [videoMessages, setVideoMessages] = useState<Message[]>([])
  
  // 模式状态（必须在 messages 和 setMessages 之前定义）
  const [mode, setMode] = useState<"companion" | "image" | "vision" | "video">("companion") // 模式：陪伴模式/创作模式/识图模式/视频模式
  
  // 根据当前模式选择对应的消息列表
  const messages = mode === "image" ? imageMessages : mode === "vision" ? visionMessages : mode === "video" ? videoMessages : companionMessages
  const setMessages = mode === "image" ? setImageMessages : mode === "vision" ? setVisionMessages : mode === "video" ? setVideoMessages : setCompanionMessages
  
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [chatCount, setChatCount] = useState(0)
  const [isLoadingMembership, setIsLoadingMembership] = useState(false) // 会员信息加载状态
  const membershipRef = useRef<MembershipInfo | null>(null)
  const chatCountRef = useRef<number>(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const loadUserDataLockRef = useRef(false) // 防止重复加载的锁
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 页面可见性定时器
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 页面焦点定时器
  const sendMessageLockRef = useRef(false) // 防止重复发送消息的锁
  const sendMessageLockTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 锁超时定时器
  const sendMessageLockTimeRef = useRef<number>(0) // 锁创建时间戳
  const [isChatRoomMode, setIsChatRoomMode] = useState(false) // 是否在聊天室模式
  const [invitedCharacters, setInvitedCharacters] = useState<string[]>([]) // 已邀请的角色ID列表
  const [isSelectingCharacters, setIsSelectingCharacters] = useState(false) // 是否在选择角色阶段
  const [chatRoomMessages, setChatRoomMessages] = useState<Message[]>([]) // 聊天室消息
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 轮询定时器引用
  const isPollingRef = useRef(false) // 是否正在轮询
  const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false) // 历史记录侧边栏是否打开
  const currentHistoryIdRef = useRef<string | null>(null) // 当前会话ID
  const hasStartedChatRef = useRef(false) // 是否已经开始聊天（发送了第一条消息）
  const [allCharacters, setAllCharacters] = useState<Character[]>(CHARACTERS) // 所有角色（系统角色 + 自定义智能体）
  const [customAgents, setCustomAgents] = useState<Character[]>([]) // 自定义智能体列表
  const [isCreateAgentDialogOpen, setIsCreateAgentDialogOpen] = useState(false) // 创建智能体对话框状态

  // 保持最新快照，避免异步 setState 导致 handleSend 读取到旧值
  useEffect(() => {
    membershipRef.current = membership
  }, [membership])
  useEffect(() => {
    chatCountRef.current = chatCount
  }, [chatCount])

  // 释放发送消息锁的辅助函数
  const releaseSendLock = () => {
    sendMessageLockRef.current = false
    sendMessageLockTimeRef.current = 0
    if (sendMessageLockTimeoutRef.current) {
      clearTimeout(sendMessageLockTimeoutRef.current)
      sendMessageLockTimeoutRef.current = null
    }
  }

  // 设置发送消息锁（带超时保护）
  const acquireSendLock = () => {
    sendMessageLockRef.current = true
    sendMessageLockTimeRef.current = Date.now()
    // 30秒后自动释放锁，防止卡死
    sendMessageLockTimeoutRef.current = setTimeout(() => {
      console.warn("⚠️ [锁超时] 发送消息锁超时，自动释放")
      releaseSendLock()
      setIsLoading(false)
    }, 30000)
  }

  // 切换角色的函数（支持异步加载自定义智能体）
  const handleCharacterChange = async (characterId: string) => {
    // 先查系统角色
    let character = getCharacterById(characterId)
    
    // 如果不是系统角色，尝试从自定义智能体中查找
    if (!character) {
      character = allCharacters.find(c => c.id === characterId) || null
    }
    
    // 如果还是找不到，尝试从API加载（可能是新创建的自定义智能体）
    if (!character && user) {
      try {
        const response = await fetch(`/api/agents/${characterId}`)
        if (response.ok) {
          const { data: agent } = await response.json()
          if (agent) {
            character = convertAgentToCharacter(agent)
            // 更新allCharacters列表
            setAllCharacters(prev => {
              if (prev.find(c => c.id === characterId)) {
                return prev
              }
              return [...prev, character!]
            })
            setCustomAgents(prev => {
              if (prev.find(c => c.id === characterId)) {
                return prev
              }
              return [...prev, character!]
            })
          }
        }
      } catch (error) {
        console.error("加载自定义智能体失败:", error)
      }
    }
    
    if (character) {
      console.log("========================================")
      console.log("🎭 [用户操作] 切换角色")
      console.log("  - 新角色:", character.name)
      console.log("  - 是否自定义:", character.isCustom)
      console.log("  - 语音:", character.voice)
      console.log("  - 当前聊天室模式:", isChatRoomMode)
      console.log("========================================")
      
      // 如果当前在聊天室模式，退出聊天室模式
      if (isChatRoomMode) {
        console.log("🔄 [切换] 退出聊天室模式，切换到普通聊天")
        setIsChatRoomMode(false)
        setIsSelectingCharacters(false)
        setInvitedCharacters([])
      }
      
      setSelectedCharacter(character)
      
      // 保存到localStorage
      if (typeof window !== "undefined") {
        localStorage.setItem(CHARACTER_STORAGE_KEY, character.id)
      }
      
      // 更新欢迎消息
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: character.welcomeMessage,
        characterId: character.id,
        characterName: character.name,
      }])
    } else {
      console.error("角色不存在:", characterId)
    }
  }

  // 加载用户数据的函数
  const loadUserData = async () => {
    // 防止重复加载
    if (loadUserDataLockRef.current) {
      console.log("⏸️ [v0] loadUserData 正在执行，跳过重复调用")
      return
    }
    
    loadUserDataLockRef.current = true
    
    try {
      console.log("========== [v0] 开始加载用户数据 ==========")
      setIsLoadingMembership(true) // 设置加载状态
      
      // 直接获取用户信息，Supabase 会自动处理 session 恢复
      // 使用 getUser() 而不是 getSession()，因为 getUser() 会自动刷新 session
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) {
        // 如果是 AuthSessionMissingError，这是正常情况（用户未登录），静默处理
        if (userError.message?.includes('session missing') || userError.message?.includes('Auth session missing')) {
          console.log("👤 [v0] 未登录，设置为游客状态")
          setUser(null)
          const guestMembership = {
            type: "guest" as const,
            label: "游客",
            dailyLimit: 3,
            hasUnlimited: false,
          }
          setMembership(guestMembership)
          const count = await getTodayChatCount(null)
          setChatCount(count)
          console.log("========== [v0] 加载完成（游客） ==========")
          return
        }
        // 其他错误才记录
        console.error("❌ [v0] 获取用户信息错误:", userError)
        setUser(null)
        const guestMembership = {
          type: "guest" as const,
          label: "游客",
          dailyLimit: 3,
          hasUnlimited: false,
        }
        setMembership(guestMembership)
        const count = await getTodayChatCount(null)
        setChatCount(count)
        console.log("========== [v0] 加载完成（游客） ==========")
        return
      }
      
      console.log("✅ [v0] 当前用户:", user?.id, user?.email || "未登录")
      setUser(user)
      
      if (!user) {
        // 如果没有用户，设置为游客状态
        const guestMembership = {
          type: "guest" as const,
          label: "游客",
          dailyLimit: 3,
          hasUnlimited: false,
        }
        setMembership(guestMembership)
        const count = await getTodayChatCount(null)
        setChatCount(count)
        console.log("👤 [v0] 未登录，设置为游客状态")
        console.log("========== [v0] 加载完成 ==========")
        return
      }
      
      // 加载会员信息和聊天次数
      console.log("🔍 [v0] 开始查询会员信息，用户 ID:", user.id)
      
      // 重试机制：最多重试5次，确保查询到正确的会员信息
      let membershipInfo = await getUserMembership()
      let retryCount = 0
      const maxRetries = 5
      
      console.log("📊 [v0] 首次查询结果:", membershipInfo.type, membershipInfo.label)
      
      // 如果查询结果是普通用户，重试查询（可能是时序问题）
      while (membershipInfo.type === "free" && retryCount < maxRetries) {
        retryCount++
        const waitTime = 300 * retryCount
        console.log(`⏳ [v0] 第 ${retryCount} 次查询结果为普通用户，等待 ${waitTime}ms 后重试...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        membershipInfo = await getUserMembership()
        console.log(`📊 [v0] 第 ${retryCount} 次重试后会员类型:`, membershipInfo.type, membershipInfo.label)
        
        // 如果查询到会员或永久会员，立即停止重试
        if (membershipInfo.type === "member" || membershipInfo.type === "lifetime") {
          console.log("✅ [v0] 查询到会员信息，停止重试")
          break
        }
      }
      
      setMembership(membershipInfo)
      console.log("🎯 [v0] 最终会员类型:", membershipInfo.type, membershipInfo.label, "重试次数:", retryCount)
      
      const count = await getTodayChatCount(user.id)
      // 确保聊天次数不超过限制（防止显示错误，如 15/3）
      const limitedCount = membershipInfo.hasUnlimited ? count : Math.min(count, membershipInfo.dailyLimit)
      setChatCount(limitedCount)
      console.log("💬 [v0] 聊天次数:", limitedCount, "/", membershipInfo.dailyLimit || "无限")
      
      // 加载自定义智能体
      try {
        const allChars = await getAllCharacters(user.id)
        setAllCharacters(allChars)
        const customChars = allChars.filter(c => c.isCustom)
        setCustomAgents(customChars)
        console.log("🤖 [v0] 加载自定义智能体:", customChars.length, "个")
      } catch (error) {
        console.error("❌ [v0] 加载自定义智能体失败:", error)
        // 失败时至少使用系统角色
        setAllCharacters(CHARACTERS)
        setCustomAgents([])
      }
      
      console.log("========== [v0] 加载完成 ==========")
    } catch (error) {
      console.error("❌ [v0] loadUserData 异常:", error)
      console.log("========== [v0] 加载失败 ==========")
    } finally {
      setIsLoadingMembership(false) // 清除加载状态
      loadUserDataLockRef.current = false // 释放锁
    }
  }

  // 从 localStorage 加载保存的角色（只在客户端执行，避免 hydration mismatch）
  useEffect(() => {
    if (typeof window !== "undefined" && !isCharacterLoaded) {
      const savedCharacterId = localStorage.getItem(CHARACTER_STORAGE_KEY)
      if (savedCharacterId) {
        // 先查系统角色
        let character = getCharacterById(savedCharacterId)
        
        // 如果不是系统角色，从allCharacters中查找（可能已加载的自定义智能体）
        if (!character) {
          character = allCharacters.find(c => c.id === savedCharacterId) || null
        }
        
        if (character && character.id !== selectedCharacter.id) {
          console.log("🎭 [v0] 从 localStorage 加载角色:", character.name)
          setSelectedCharacter(character)
          setMessages([{
            id: "welcome",
            role: "assistant",
            content: character.welcomeMessage,
            characterId: character.id,
            characterName: character.name,
          }])
        }
      }
      setIsCharacterLoaded(true)
    }
  }, [isCharacterLoaded, selectedCharacter.id, allCharacters])

  useEffect(() => {
    console.log("🚀 [v0] useEffect 执行，初始化页面")
    
    // 首次加载 - 等待 session 恢复后再加载数据（页面刷新时）
    const initLoad = async () => {
      // 等待一小段时间确保 Supabase session 已恢复（页面刷新时）
      console.log("⏳ [v0] 首次加载，等待 session 恢复...")
      await new Promise(resolve => setTimeout(resolve, 200))
      console.log("✅ [v0] 开始加载用户数据...")
      await loadUserData()
      
      // 恢复未完成的视频生成任务
      restoreVideoTask()
    }
    initLoad()

    // 监听认证状态变化
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log("🔄 [v0] 认证状态变化:", _event, "用户:", session?.user?.id || "无")
      
      // 立即更新用户状态
      setUser(session?.user ?? null)
      
      // 如果是登录事件，等待一小段时间确保 session 完全建立
      if (_event === 'SIGNED_IN' && session?.user) {
        console.log("⏳ [v0] 用户登录，等待 session 建立后加载会员信息...")
        console.log("📍 [v0] 当前域名:", window.location.origin)
        // 等待更长时间确保 session 和 cookies 完全建立（ngrok 可能需要更长时间）
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      // 重新加载会员信息
      await loadUserData()
    })

    // 监听页面可见性变化（用户切换标签页后回来时刷新）
    // 添加防抖，避免频繁触发
    // 注意：只在用户主动切换标签页时才刷新，避免在发送消息时触发
    let lastVisibilityChange = Date.now()
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        // 如果距离上次变化不到5秒，忽略（可能是频繁切换）
        if (now - lastVisibilityChange < 5000) {
          console.log("[v0] 页面可见性变化过于频繁，忽略")
          return
        }
        lastVisibilityChange = now
        
        // 检查并恢复卡住的锁
        if (sendMessageLockRef.current && !isLoading) {
          console.warn("⚠️ [锁恢复] 检测到卡住的发送锁，自动释放")
          releaseSendLock()
        }
        
        // 恢复视频任务（如果存在）
        if (!isPollingRef.current) {
          restoreVideoTask()
        }
        
        // 清除之前的定时器
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current)
        }
        // 延迟执行，避免频繁触发（增加到5秒，避免重复查询）
        visibilityTimeoutRef.current = setTimeout(() => {
          // 检查是否正在加载，如果是则跳过
          if (!loadUserDataLockRef.current) {
            console.log("[v0] 页面重新可见，刷新用户数据")
            loadUserData()
          } else {
            console.log("[v0] 页面重新可见，但 loadUserData 正在执行，跳过")
          }
          visibilityTimeoutRef.current = null
        }, 5000) // 5秒防抖，避免频繁触发
      } else {
        // 页面不可见时清除定时器
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current)
          visibilityTimeoutRef.current = null
        }
      }
    }

    // 监听页面焦点变化（用户切换窗口后回来时刷新）
    // 添加防抖，避免频繁触发
    // 注意：只在用户主动切换窗口时才刷新，避免在发送消息时触发
    let lastFocusChange = Date.now()
    const handleFocus = () => {
      const now = Date.now()
      // 如果距离上次变化不到5秒，忽略（可能是频繁切换）
      if (now - lastFocusChange < 5000) {
        console.log("[v0] 页面焦点变化过于频繁，忽略")
        return
      }
      lastFocusChange = now
      
      // 清除之前的定时器
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
      }
      // 延迟执行，避免频繁触发（增加到5秒，避免重复查询）
      focusTimeoutRef.current = setTimeout(() => {
        // 检查是否正在加载，如果是则跳过
        if (!loadUserDataLockRef.current) {
          console.log("[v0] 页面获得焦点，刷新用户数据")
          loadUserData()
        } else {
          console.log("[v0] 页面获得焦点，但 loadUserData 正在执行，跳过")
        }
        focusTimeoutRef.current = null
      }, 5000) // 5秒防抖，避免频繁触发
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    // 定期健康检查：每30秒检查一次锁的状态
    const healthCheckInterval = setInterval(() => {
      // 如果锁被占用但不在加载状态，可能是卡住了
      if (sendMessageLockRef.current && !isLoading) {
        const lockAge = sendMessageLockTimeRef.current > 0 ? Date.now() - sendMessageLockTimeRef.current : 0
        // 如果锁存在超过35秒（超过超时时间），强制释放
        if (lockAge > 35000) {
          console.warn("⚠️ [健康检查] 检测到卡住的发送锁（已存在", Math.floor(lockAge / 1000), "秒），强制释放")
          releaseSendLock()
        }
      }
    }, 30000) // 每30秒检查一次

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      clearInterval(healthCheckInterval)
      // 清理定时器
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current)
        visibilityTimeoutRef.current = null
      }
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = null
      }
      // 清理视频轮询定时器
      if (pollingTimeoutRef.current) {
        clearTimeout(pollingTimeoutRef.current)
        pollingTimeoutRef.current = null
      }
      // 清理发送锁超时定时器
      if (sendMessageLockTimeoutRef.current) {
        clearTimeout(sendMessageLockTimeoutRef.current)
        sendMessageLockTimeoutRef.current = null
      }
    }
  }, [supabase])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      })
    }
  }, [messages])

  // 监听消息变化，更新历史记录（所有模式，但非聊天室模式）
  useEffect(() => {
    if (
      !isChatRoomMode &&
      hasStartedChatRef.current &&
      currentHistoryIdRef.current &&
      messages.length > 1
    ) {
      // 延迟更新，避免频繁保存
      const timeoutId = setTimeout(() => {
        updateChatHistory(
          user?.id || null,
          currentHistoryIdRef.current!,
          messages
        )
      }, 1000) // 1秒防抖

      return () => clearTimeout(timeoutId)
    }
  }, [messages, mode, isChatRoomMode, user?.id])

  // 处理选择历史记录
  const handleSelectHistory = (history: ChatHistory) => {
    // 保存当前聊天记录（如果有，且非聊天室模式）
    if (
      !isChatRoomMode &&
      hasStartedChatRef.current &&
      messages.length > 1 &&
      currentHistoryIdRef.current
    ) {
      updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
    }

    // 加载选中的历史记录
    let character: Character | null = null
    if (history.mode === "companion") {
      character = getCharacterById(history.characterId)
      if (character) {
        setSelectedCharacter(character)
      }
    }
    
    // 切换到对应的模式
    setMode(history.mode)
    
    // 恢复消息（根据模式添加欢迎消息）
    if (history.mode === "companion") {
      const welcomeMessage: Message = {
        id: "welcome",
        role: "assistant",
        content: character?.welcomeMessage || "你好！",
        characterId: history.characterId,
        characterName: history.characterName,
      }
      setMessages([welcomeMessage, ...history.messages])
    } else {
      // 非陪伴模式直接加载消息
      setMessages(history.messages)
    }
    
    // 更新状态
    currentHistoryIdRef.current = history.id
    hasStartedChatRef.current = true
    
    console.log("📖 [历史记录] 加载会话:", history.id, "模式:", history.mode)
  }

  // 保存视频任务到 localStorage
  const saveVideoTask = (requestId: string, messageId: string, attempts: number) => {
    if (typeof window === "undefined") return
    const task = {
      requestId,
      messageId,
      attempts,
      timestamp: Date.now(),
      mode: "video" as const,
    }
    localStorage.setItem("video_generation_task", JSON.stringify(task))
    console.log("💾 [视频] 保存任务到 localStorage:", task)
  }

  // 清除视频任务
  const clearVideoTask = () => {
    if (typeof window === "undefined") return
    localStorage.removeItem("video_generation_task")
    console.log("🗑️ [视频] 清除任务")
  }

  // 轮询视频生成状态
  const pollVideoStatus = async (requestId: string, messageId: string, initialAttempts: number = 0) => {
    const maxAttempts = 60 // 最多轮询60次（5分钟）
    const pollInterval = 5000 // 每5秒轮询一次
    let attempts = initialAttempts

    // 保存任务状态
    saveVideoTask(requestId, messageId, attempts)
    isPollingRef.current = true

    const poll = async () => {
      // 检查页面是否可见，如果不可见则暂停轮询
      if (typeof document !== "undefined" && document.hidden) {
        console.log("⏸️ [视频] 页面不可见，暂停轮询")
        pollingTimeoutRef.current = setTimeout(() => {
          if (!document.hidden) {
            poll()
          }
        }, pollInterval)
        return
      }

      attempts++
      console.log(`🎬 [视频] 轮询第 ${attempts}/${maxAttempts} 次，RequestId: ${requestId}`)

      // 更新任务状态
      saveVideoTask(requestId, messageId, attempts)

      try {
        const response = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "查询任务状态失败")
        }

        const statusData = await response.json()
        console.log("🎬 [视频] 任务状态:", statusData)

        const status = statusData.status || statusData.state
        const videoUrl = statusData.results?.videos?.[0]?.url || statusData.video_url || statusData.videoUrl

        if (status === "Succeed" || status === "succeed" || status === "completed") {
          // 任务完成，更新消息显示视频
          if (videoUrl) {
            console.log("🎬 [视频] 视频生成完成，URL:", videoUrl)
            setMessages((prev) => {
              const newMessages = prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      content: "视频生成完成！",
                      videoUrl: videoUrl,
                    }
                  : m
              )
              
              // 更新历史记录
              if (currentHistoryIdRef.current && !isChatRoomMode) {
                updateChatHistory(user?.id || null, currentHistoryIdRef.current, newMessages)
              }
              
              return newMessages
            })
            setIsLoading(false)
            releaseSendLock()
            clearVideoTask()
            isPollingRef.current = false
            if (pollingTimeoutRef.current) {
              clearTimeout(pollingTimeoutRef.current)
              pollingTimeoutRef.current = null
            }
          } else {
            throw new Error("任务完成但未返回视频 URL")
          }
        } else if (status === "Failed" || status === "failed" || status === "error") {
          // 任务失败
          const errorReason = statusData.reason || statusData.error || "未知错误"
          console.error("🎬 [视频] 任务失败:", errorReason)
          setMessages((prev) => {
            const newMessages = prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: `视频生成失败: ${errorReason}`,
                  }
                : m
            )
            
            // 更新历史记录
            if (currentHistoryIdRef.current && !isChatRoomMode) {
              updateChatHistory(user?.id || null, currentHistoryIdRef.current, newMessages)
            }
            
            return newMessages
          })
          setIsLoading(false)
          sendMessageLockRef.current = false
          clearVideoTask()
          isPollingRef.current = false
          if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current)
            pollingTimeoutRef.current = null
          }
        } else if (attempts >= maxAttempts) {
          // 达到最大轮询次数
          console.error("🎬 [视频] 轮询超时")
          setMessages((prev) => {
            const newMessages = prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: "视频生成超时，请稍后重试",
                  }
                : m
            )
            
            // 更新历史记录
            if (currentHistoryIdRef.current && !isChatRoomMode) {
              updateChatHistory(user?.id || null, currentHistoryIdRef.current, newMessages)
            }
            
            return newMessages
          })
          setIsLoading(false)
          sendMessageLockRef.current = false
          clearVideoTask()
          isPollingRef.current = false
          if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current)
            pollingTimeoutRef.current = null
          }
        } else {
          // 任务还在处理中，继续轮询
          // 更新消息显示进度
          const statusText = status === "InQueue" ? "排队中" : status === "InProgress" ? "处理中" : "处理中"
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: `视频生成任务已提交，${statusText}... (${attempts}/${maxAttempts})`,
                  }
                : m
            )
          )
          pollingTimeoutRef.current = setTimeout(poll, pollInterval)
        }
      } catch (error) {
        console.error("🎬 [视频] 轮询错误:", error)
        const errorMessage = error instanceof Error ? error.message : "未知错误"
        
        if (attempts >= maxAttempts) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? {
                    ...m,
                    content: `视频生成失败: ${errorMessage}`,
                  }
                : m
            )
          )
          setIsLoading(false)
          sendMessageLockRef.current = false
          clearVideoTask()
          isPollingRef.current = false
          if (pollingTimeoutRef.current) {
            clearTimeout(pollingTimeoutRef.current)
            pollingTimeoutRef.current = null
          }
        } else {
          // 继续重试
          saveVideoTask(requestId, messageId, attempts)
          pollingTimeoutRef.current = setTimeout(poll, pollInterval)
        }
      }
    }

    // 开始轮询
    pollingTimeoutRef.current = setTimeout(poll, pollInterval)
  }

  // 恢复未完成的视频生成任务
  const restoreVideoTask = () => {
    if (typeof window === "undefined" || isPollingRef.current) return
    
    try {
      const taskStr = localStorage.getItem("video_generation_task")
      if (!taskStr) return
      
      const task = JSON.parse(taskStr)
      if (!task.requestId || !task.messageId) return
      
      // 检查任务是否过期（超过5分钟）
      const taskAge = Date.now() - task.timestamp
      const maxAge = 5 * 60 * 1000 // 5分钟
      if (taskAge > maxAge) {
        console.log("⏰ [视频] 任务已过期，清除")
        clearVideoTask()
        return
      }
      
      console.log("🔄 [视频] 恢复未完成的任务:", task)
      
      // 切换到视频模式
      if (task.mode === "video") {
        setMode("video")
      }
      
      // 检查消息是否存在（使用 videoMessages，因为任务是在视频模式下创建的）
      const messageExists = videoMessages.some(m => m.id === task.messageId)
      
      if (!messageExists) {
        console.log("⚠️ [视频] 消息不存在，清除任务")
        clearVideoTask()
        return
      }
      
      // 切换到视频模式（如果需要）
      if (mode !== "video") {
        setMode("video")
      }
      
      // 恢复轮询
      setIsLoading(true)
      pollVideoStatus(task.requestId, task.messageId, task.attempts || 0)
    } catch (error) {
      console.error("❌ [视频] 恢复任务失败:", error)
      clearVideoTask()
    }
  }

  const handleSend = async (content: string, imageUrl?: string, videoOptions?: { imageSize: string; duration: number }) => {
    // 防止重复发送
    if (sendMessageLockRef.current) {
      console.log("⏸️ [v0] 消息正在发送中，跳过重复调用")
      return
    }

    // 如果正在加载，也跳过
    if (isLoading) {
      console.log("⏸️ [v0] 正在处理中，跳过重复调用")
      return
    }

    // 获取锁（带超时保护）
    acquireSendLock()

    console.log("========================================")
    console.log("💬 [用户操作] 发送聊天消息")
    console.log("📍 [环境信息]")
    console.log("  - 消息内容:", content.substring(0, 50) + (content.length > 50 ? "..." : ""))
    console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
    console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
    console.log("  - 聊天次数:", chatCount)
    console.log("  - 会员信息加载中:", isLoadingMembership)
    console.log("  - 当前角色:", selectedCharacter.name)
    console.log("  - 聊天室模式:", isChatRoomMode)
    console.log("  - 已邀请角色:", invitedCharacters)
    console.log("  - 选择角色阶段:", isSelectingCharacters)
    console.log("========================================")
    
    // 会员信息加载中时，不阻塞发送（用快照兜底），避免“发送后无反应”
    if (isChatRoomMode && invitedCharacters.length > 0) {
      console.log("🏠 [聊天室] 检测到聊天室模式，跳过会员信息检查")
    } else if (isLoadingMembership) {
      console.log("⏳ [提示] 会员信息正在加载，先用当前快照继续发送（不阻塞）")
    }
    
    // 使用快照（避免异步 setState 造成的“本次发送仍用旧 membership”）
    const activeUser = user || null
    const currentCount = chatCountRef.current || chatCount

    const checkMembership = membershipRef.current || membership || {
      type: "guest" as const,
      label: "游客",
      dailyLimit: 3,
      hasUnlimited: false,
    }
    
    // 检查聊天次数限制
    if (checkMembership && !checkMembership.hasUnlimited && currentCount >= checkMembership.dailyLimit) {
      releaseSendLock() // 释放锁
      alert(`今日聊天次数已达上限（${checkMembership.dailyLimit}次）。${checkMembership.type === "guest" ? "请登录以获取更多次数，或升级为会员享受无限对话。" : "请升级为会员享受无限对话。"}`)
      return
    }
    
    console.log("✅ [验证] 通过所有检查，开始发送消息...")

    // 如果是识图模式，使用识图API
    if (mode === "vision") {
      // 检查会员权限（识图模式需要会员）
      if (checkMembership.type !== "member" && checkMembership.type !== "lifetime") {
        releaseSendLock() // 释放锁
        alert("识图功能需要会员权限。请升级为会员后使用。")
        return
      }
      console.log("👁️ [识图] 识图模式")
      console.log("  - 内容:", content)
      console.log("  - 图片URL:", imageUrl)
      
      // 识图模式支持纯文本聊天，不强制要求图片
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content || (imageUrl ? "请分析这张图片" : ""),
        userImageUrl: imageUrl || undefined,
      }

      setMessages((prev) => {
        const newMessages = [...prev, userMessage]
        
        // 如果是第一次发送消息，创建新的历史记录
        if (!hasStartedChatRef.current && !currentHistoryIdRef.current && !isChatRoomMode) {
          hasStartedChatRef.current = true
          const historyId = saveChatHistory(
            user?.id || null,
            "system",
            "识图",
            mode,
            newMessages
          )
          currentHistoryIdRef.current = historyId
          console.log("💾 [历史记录] 创建新会话，模式:", mode, "ID:", historyId)
        }
        
        return newMessages
      })
      setIsLoading(true)

      try {
        // 获取最近20条消息（包括当前消息）作为上下文
        const recentMessages = [...messages, userMessage].slice(-20)
        console.log("👁️ [识图] 上下文消息数量:", recentMessages.length)
        
        const response = await fetch("/api/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: recentMessages.map(m => ({
              role: m.role,
              content: m.content,
              userImageUrl: m.userImageUrl,
              imageUrl: m.imageUrl,
            })),
            imageUrl: imageUrl,
          }),
        })
        
        // 记录使用的模型信息（从响应头获取）
        const usedModel = response.headers.get("X-Vision-Model")
        const attemptCount = response.headers.get("X-Attempt-Count")
        if (usedModel) {
          console.log("========================================")
          console.log("✅ [识图] 模型信息")
          console.log(`  - 使用的模型: ${usedModel}`)
          console.log(`  - 尝试次数: ${attemptCount || "未知"}`)
          console.log("========================================")
        }

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "分析图片失败")
        }

        if (!response.body) {
          throw new Error("响应体为空")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        const assistantMessageId = (Date.now() + 1).toString()
        let assistantContent = ""

        // 先创建一条空消息
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMessageId,
            role: "assistant",
            content: "",
          },
        ])

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          assistantContent += buffer
          buffer = ""

          // 更新消息内容
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, content: assistantContent } : m
            )
          )
        }
      } catch (error) {
        console.error("👁️ [识图] 错误:", error)
        const errorMessage = error instanceof Error ? error.message : "未知错误"
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `抱歉，分析图片时遇到问题: ${errorMessage}。请稍后再试。`,
          },
        ])
      } finally {
        setIsLoading(false)
        releaseSendLock()
      }
      return
    }

    // 如果是视频模式，使用视频生成API
    if (mode === "video") {
      // 检查会员权限（视频模式需要会员）
      if (checkMembership.type !== "member" && checkMembership.type !== "lifetime") {
        releaseSendLock() // 释放锁
        alert("视频生成功能需要会员权限。请升级为会员后使用。")
        return
      }
      // 如果没有提供图片，尝试从消息历史中找到上一次使用的图片
      let finalImageUrl = imageUrl
      if (!finalImageUrl) {
        // 从最近的用户消息中查找图片
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].userImageUrl) {
            finalImageUrl = messages[i].userImageUrl
            console.log("🎬 [视频] 从消息历史中复用图片，消息索引:", i)
            break
          }
        }
      }
      
      // 如果仍然没有图片，提示用户需要提供图片
      if (!finalImageUrl) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: "视频生成需要提供图片。请先上传一张图片，然后再发送您的视频生成请求。",
          },
        ])
        return
      }
      
      console.log("🎬 [视频] 开始生成视频")
      console.log("  - Prompt:", content)
      console.log("  - 图片URL:", finalImageUrl ? (finalImageUrl.substring(0, 50) + "...") : "未提供")
      console.log("  - 尺寸:", videoOptions?.imageSize || "1280x720")
      console.log("  - 时长:", videoOptions?.duration || 5, "秒")
      
      const userMessage: Message = {
        id: Date.now().toString(),
        role: "user",
        content: content || (finalImageUrl ? "请生成视频" : "请生成视频"),
        userImageUrl: finalImageUrl || undefined,
      }

      setMessages((prev) => {
        const newMessages = [...prev, userMessage]
        
        // 如果是第一次发送消息，创建新的历史记录
        if (!hasStartedChatRef.current && !currentHistoryIdRef.current && !isChatRoomMode) {
          hasStartedChatRef.current = true
          const historyId = saveChatHistory(
            user?.id || null,
            "system",
            "视频",
            mode,
            newMessages
          )
          currentHistoryIdRef.current = historyId
          console.log("💾 [历史记录] 创建新会话，模式:", mode, "ID:", historyId)
        }
        
        return newMessages
      })
      setIsLoading(true)

      try {
        // 获取最近5条消息（包括当前消息）作为上下文
        const recentMessages = [...messages, userMessage].slice(-5)
        console.log("🎬 [视频] 上下文消息数量:", recentMessages.length)
        
        const response = await fetch("/api/video-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: content || "生成一个视频",
            messages: recentMessages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            image_size: videoOptions?.imageSize || "1280x720",
            duration: videoOptions?.duration || 5,
            imageUrl: finalImageUrl,
          }),
        })

        if (!response.ok) {
          let errorData
          try {
            errorData = await response.json()
          } catch {
            errorData = { error: `HTTP ${response.status}: ${response.statusText}` }
          }
          
          // 解析错误信息
          let errorMessage = errorData.error || "生成视频失败"
          
          // 如果是账户余额不足的错误
          if (errorData.code === 30001 || errorMessage.includes("balance is insufficient") || errorMessage.includes("余额不足")) {
            errorMessage = "账户余额不足。请检查您的 SiliconFlow API 账户余额，或联系管理员充值。"
          } else if (errorData.message) {
            // 如果有详细的错误消息，使用它
            errorMessage = errorData.message
            if (errorData.code) {
              errorMessage = `[错误代码 ${errorData.code}] ${errorMessage}`
            }
          }
          
          throw new Error(errorMessage)
        }

        const data = await response.json()
        console.log("🎬 [视频] 视频生成响应:", JSON.stringify(data, null, 2))

        // 如果返回了 videoUrl，直接使用
        if (data.videoUrl) {
          setMessages((prev) => {
            const newMessages: Message[] = [
              ...prev,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant" as const,
                content: "视频生成完成",
                videoUrl: data.videoUrl,
              },
            ]
            
            // 更新历史记录
            if (currentHistoryIdRef.current && !isChatRoomMode) {
              updateChatHistory(user?.id || null, currentHistoryIdRef.current, newMessages)
            }
            
            return newMessages
          })
        } else if (data.requestId || data.taskId) {
          // 如果有 requestId 或 taskId，需要轮询获取结果
          const requestId = data.requestId || data.taskId
          const assistantMessageId = (Date.now() + 1).toString()
          setMessages((prev) => {
            const newMessages: Message[] = [
              ...prev,
              {
                id: assistantMessageId,
                role: "assistant" as const,
                content: "视频生成任务已提交，正在处理中...",
              },
            ]
            
            // 更新历史记录
            if (currentHistoryIdRef.current && !isChatRoomMode) {
              updateChatHistory(user?.id || null, currentHistoryIdRef.current, newMessages)
            }
            
            return newMessages
          })
          console.log("🎬 [视频] RequestId:", requestId, "开始轮询获取结果")
          
          // 开始轮询任务状态
          pollVideoStatus(requestId, assistantMessageId)
        } else if (data.error) {
          // 如果有错误信息，显示错误
          throw new Error(data.error + (data.responseData ? `\n响应数据: ${JSON.stringify(data.responseData)}` : ""))
        } else {
          // 如果都没有，显示完整响应以便调试
          console.error("🎬 [视频] 未找到 videoUrl 或 taskId，完整响应:", data)
          throw new Error(`未返回视频 URL 或任务 ID。响应数据: ${JSON.stringify(data)}`)
        }
      } catch (error) {
        console.error("🎬 [视频] 错误:", error)
        const errorMessage = error instanceof Error ? error.message : "未知错误"
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `抱歉，生成视频时遇到问题: ${errorMessage}。请稍后再试。`,
          },
        ])
      } finally {
        setIsLoading(false)
        releaseSendLock()
      }
      return
    }

    // 如果是创作模式，使用创作API
    if (mode === "image") {
      // 检查会员权限（创作模式需要会员）
      if (checkMembership.type !== "member" && checkMembership.type !== "lifetime") {
        releaseSendLock() // 释放锁
        alert("创作功能需要会员权限。请升级为会员后使用。")
        return
      }
      console.log("🎨 [创作] 开始生成图片")
      console.log("  - Prompt:", content)
      
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => {
        const newMessages = [...prev, userMessage]
        
        // 如果是第一次发送消息，创建新的历史记录
        if (!hasStartedChatRef.current && !currentHistoryIdRef.current && !isChatRoomMode) {
          hasStartedChatRef.current = true
          const historyId = saveChatHistory(
            user?.id || null,
            "system",
            "创作",
            mode,
            newMessages
          )
          currentHistoryIdRef.current = historyId
          console.log("💾 [历史记录] 创建新会话，模式:", mode, "ID:", historyId)
        }
        
        return newMessages
      })
      setIsLoading(true)

      try {
        // 获取最近5条消息（包括当前消息）作为上下文
        const recentMessages = [...messages, userMessage].slice(-5)
        console.log("🎨 [创作] 上下文消息数量:", recentMessages.length)
        
        const response = await fetch("/api/image-generation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: content,
            messages: recentMessages.map(m => ({
              role: m.role,
              content: m.content,
            })),
            image_size: "1024x1024",
            batch_size: 1,
            num_inference_steps: 20,
            guidance_scale: 7.5,
            cfg: 10.05,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || "生成图片失败")
        }

        const data = await response.json()
        console.log("🎨 [创作] 图片生成成功:", data.imageUrl)

        // 添加图片消息
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "图片生成完成",
            imageUrl: data.imageUrl,
          },
        ])
      } catch (error) {
        console.error("🎨 [创作] 错误:", error)
        const errorMessage = error instanceof Error ? error.message : "未知错误"
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: `抱歉，生成图片时遇到问题: ${errorMessage}。请稍后再试。`,
          },
        ])
      } finally {
        setIsLoading(false)
        releaseSendLock()
      }
      return
    }

    // 如果是聊天室模式，使用聊天室API
    if (isChatRoomMode && invitedCharacters.length > 0 && !isSelectingCharacters) {
      console.log("🏠 [聊天室] 开始发送聊天室消息")
      console.log("  - 已邀请角色:", invitedCharacters)
      console.log("  - 消息历史数量:", messages.length)
      
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)

      try {
        console.log("🏠 [聊天室] 调用 /api/chat-room API")
        // 限制消息历史为最近20条（包括当前消息），保持上下文但避免过长
        const allMessages = [...messages, userMessage]
        const recentMessages = allMessages.slice(-20)
        console.log("🏠 [聊天室] 总消息数:", allMessages.length, "保留最近:", recentMessages.length)
        
        const response = await fetch("/api/chat-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: recentMessages.map((m) => ({
              role: m.role,
              content: m.content,
              characterId: m.characterId,
              characterName: m.characterName,
            })),
            invitedCharacters,
          }),
        })

        if (!response.ok) {
          throw new Error("请求失败")
        }

        if (!response.body) {
          throw new Error("响应体为空")
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let currentCharacterId = ""
        let currentCharacterName = ""
        let accumulatedContent: Record<string, string> = {}
        let messageIds: Record<string, string> = {} // 存储每个角色的消息ID
        const baseId = Date.now()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          
          // 处理buffer，查找CHARACTER标记和内容
          while (buffer.length > 0) {
            // 查找CHARACTER标记
            const characterIndex = buffer.indexOf("CHARACTER:")
            if (characterIndex !== -1) {
              // 如果有之前角色的内容，先处理
              if (currentCharacterId && accumulatedContent[currentCharacterId]) {
                const content = accumulatedContent[currentCharacterId].trim()
                if (content) {
                  if (!messageIds[currentCharacterId]) {
                    // 创建新消息
                    const newId = `chatroom-${baseId}-${currentCharacterId}`
                    messageIds[currentCharacterId] = newId
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: newId,
                        role: "assistant",
                        content: content,
                        characterId: currentCharacterId,
                        characterName: currentCharacterName,
                      },
                    ])
                  } else {
                    // 更新现有消息
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === messageIds[currentCharacterId]
                          ? { ...m, content: content }
                          : m
                      )
                    )
                  }
                }
              }
              
              // 解析CHARACTER标记
              const charEndIndex = buffer.indexOf("\n", characterIndex)
              if (charEndIndex !== -1) {
                const charLine = buffer.substring(characterIndex, charEndIndex)
                const match = charLine.match(/CHARACTER:([^|]+)\|([^|]+)\|/)
                if (match) {
                  currentCharacterId = match[1]
                  currentCharacterName = match[2]
                  accumulatedContent[currentCharacterId] = ""
                  messageIds[currentCharacterId] = "" // 重置消息ID
                  buffer = buffer.substring(charEndIndex + 1)
                  continue
                }
              }
            }
            
            // 如果没有CHARACTER标记，或者已经处理完CHARACTER标记，处理内容
            if (currentCharacterId) {
              // 查找下一个CHARACTER标记的位置
              const nextCharIndex = buffer.indexOf("CHARACTER:")
              if (nextCharIndex !== -1) {
                // 有下一个角色，处理当前角色的内容
                const content = buffer.substring(0, nextCharIndex).trim()
                if (content) {
                  accumulatedContent[currentCharacterId] += content
                  buffer = buffer.substring(nextCharIndex)
                } else {
                  buffer = buffer.substring(nextCharIndex)
                }
              } else {
                // 没有下一个角色，全部是当前角色的内容
                accumulatedContent[currentCharacterId] += buffer
                buffer = ""
              }
              
              // 更新消息
              if (accumulatedContent[currentCharacterId]) {
                const content = accumulatedContent[currentCharacterId].trim()
                if (content) {
                  if (!messageIds[currentCharacterId]) {
                    const newId = `chatroom-${baseId}-${currentCharacterId}`
                    messageIds[currentCharacterId] = newId
                    setMessages((prev) => [
                      ...prev,
                      {
                        id: newId,
                        role: "assistant",
                        content: content,
                        characterId: currentCharacterId,
                        characterName: currentCharacterName,
                      },
                    ])
                  } else {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === messageIds[currentCharacterId]
                          ? { ...m, content: content }
                          : m
                      )
                    )
                  }
                }
              }
            } else {
              // 没有当前角色，清空buffer（可能是初始的空白）
              buffer = ""
            }
          }
        }
        
        // 处理最后一条消息
        if (currentCharacterId && accumulatedContent[currentCharacterId]) {
          const finalContent = accumulatedContent[currentCharacterId].trim()
          if (finalContent) {
            if (!messageIds[currentCharacterId]) {
              const newId = `chatroom-${baseId}-${currentCharacterId}`
              setMessages((prev) => [
                ...prev,
                {
                  id: newId,
                  role: "assistant",
                  content: finalContent,
                  characterId: currentCharacterId,
                  characterName: currentCharacterName,
                },
              ])
            } else {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageIds[currentCharacterId]
                    ? { ...m, content: finalContent }
                    : m
                )
              )
            }
          }
        }
      } catch (error) {
        console.error("🏠 [聊天室] 错误:", error)
        const errorMessage = error instanceof Error ? error.message : "未知错误"
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: "assistant",
            content: `抱歉，发送消息时出错：${errorMessage}`,
          },
        ])
      } finally {
        console.log("🏠 [聊天室] 消息发送完成")
        setIsLoading(false)
        releaseSendLock()
      }
      return
    } else if (isChatRoomMode) {
      console.log("⚠️ [聊天室] 聊天室模式但条件不满足:")
      console.log("  - isChatRoomMode:", isChatRoomMode)
      console.log("  - invitedCharacters.length:", invitedCharacters.length)
      console.log("  - isSelectingCharacters:", isSelectingCharacters)
      releaseSendLock()
      return
    }

    // 普通聊天模式
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => {
      const newMessages = [...prev, userMessage]
      
      // 如果是第一次发送消息，创建新的历史记录
      if (!hasStartedChatRef.current && !currentHistoryIdRef.current) {
        hasStartedChatRef.current = true
        // 所有模式都创建历史记录（非聊天室模式）
        if (!isChatRoomMode) {
          const historyId = saveChatHistory(
            user?.id || null,
            mode === "companion" ? selectedCharacter.id : "system",
            mode === "companion" ? selectedCharacter.name : (mode === "image" ? "创作" : mode === "vision" ? "识图" : "视频"),
            mode,
            newMessages
          )
          currentHistoryIdRef.current = historyId
          console.log("💾 [历史记录] 创建新会话，模式:", mode, "ID:", historyId)
        }
      }
      
      return newMessages
    })
    setIsLoading(true)

    let accumulatedContent = ""
    let assistantMessageCreated = false
    const assistantId = (Date.now() + 1).toString()

    try {
      // 限制消息历史为最近20条（包括当前消息），保持上下文但避免过长
      const allMessages = [...messages, userMessage]
      const recentMessages = allMessages.slice(-20)
      console.log("[v0] 聊天模式 - 总消息数:", allMessages.length, "保留最近:", recentMessages.length)
      
      // 创建带超时的 fetch 请求（180秒超时，工具调用+搜索可能需要更长时间）
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 180000)
      
      let response: Response
      try {
        response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            messages: recentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
            characterId: selectedCharacter.id,
            userId: user?.id || null,
          }),
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
      } catch (error: any) {
        clearTimeout(timeoutId)
        if (error.name === "AbortError") {
          throw new Error("请求超时（180秒）。工具调用和搜索可能需要更长时间，请稍后重试。")
        }
        throw error
      }

      const contentType = response.headers.get("Content-Type")
      console.log("[v0] Response status:", response.status, "Content-Type:", contentType)

      // 检查响应状态
      if (!response.ok) {
        let errorText = ""
        try {
          // 克隆响应以便读取错误信息
          const clonedResponse = response.clone()
          errorText = await clonedResponse.text()
          console.error("[v0] API error response:", errorText)
        } catch (e) {
          console.error("[v0] Failed to read error response:", e)
        }
        
        let errorMessage = "请求失败"
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error || errorMessage
          } catch (e) {
            errorMessage = errorText || `HTTP ${response.status}`
          }
        } else {
          errorMessage = `HTTP ${response.status}`
        }
        throw new Error(errorMessage)
      }

      // 检查响应体
      if (!response.body) {
        throw new Error("响应体为空")
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let hasReceivedData = false

        while (true) {
          const { done, value } = await reader.read()
        
        if (done) {
          console.log("[v0] Stream finished, total content length:", accumulatedContent.length)
          // 如果流结束了但还没有创建消息，创建一个空消息
          if (!assistantMessageCreated && accumulatedContent.length === 0) {
            setMessages((prev) => [
              ...prev,
              {
                id: assistantId,
                role: "assistant",
                content: "抱歉，没有收到回复。请稍后再试。",
                characterId: selectedCharacter.id,
                characterName: selectedCharacter.name,
              },
            ])
          }
          break
        }

          const chunk = decoder.decode(value, { stream: true })
        console.log("[v0] Received chunk:", chunk.substring(0, 50))

          if (chunk) {
          hasReceivedData = true
            accumulatedContent += chunk

            if (!assistantMessageCreated) {
            setMessages((prev) => [...prev, { 
              id: assistantId, 
              role: "assistant", 
              content: accumulatedContent,
              characterId: selectedCharacter.id,
              characterName: selectedCharacter.name,
            }])
              assistantMessageCreated = true
            } else {
              setMessages((prevMessages) =>
              prevMessages.map((m) => 
                m.id === assistantId 
                  ? { ...m, content: accumulatedContent, characterId: selectedCharacter.id, characterName: selectedCharacter.name }
                  : m
              ),
            )
          }
        }
      }

      // 如果流结束了但没有收到任何数据
      if (!hasReceivedData && accumulatedContent.length === 0) {
        throw new Error("未收到任何响应数据")
      }
    } catch (error) {
      console.error("[v0] Chat error:", error)
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          content: `抱歉,我现在遇到了一些问题: ${errorMessage}。请稍后再试。`,
          characterId: selectedCharacter.id,
          characterName: selectedCharacter.name,
        },
      ])
    } finally {
      setIsLoading(false)
      releaseSendLock() // 释放发送锁
      // 在消息发送成功后增加聊天次数（无论成功或失败都计数）
      await incrementChatCount(user?.id || null)
      // 重新获取最新次数并更新显示
      const finalCount = await getTodayChatCount(user?.id || null)
      setChatCount(finalCount)
      console.log("[v0] 消息发送完成，当前聊天次数:", finalCount, "/", membership?.dailyLimit || "无限")
    }
  }

  const handleGoogleLogin = async () => {
    console.log("========================================")
    console.log("🔵 [用户操作] 点击登录按钮")
    console.log("📍 [环境信息]")
    console.log("  - 当前域名:", window.location.origin)
    console.log("  - 当前路径:", window.location.pathname)
    console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
    console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
    console.log("  - 聊天次数:", chatCount)
    console.log("🚀 [操作] 开始 Google OAuth 登录流程...")
    console.log("========================================")
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        // 强制每次都弹出账号选择，不再静默使用上次登录的账号
        queryParams: {
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      console.error("❌ [登录错误]:", error)
      console.log("========================================")
    } else {
      console.log("✅ [登录] OAuth 流程已启动，等待重定向...")
      console.log("========================================")
    }
  }

  const handleLogout = async () => {
    console.log("========================================")
    console.log("🔴 [用户操作] 点击退出登录按钮")
    console.log("📍 [环境信息]")
    console.log("  - 当前域名:", window.location.origin)
    console.log("  - 当前路径:", window.location.pathname)
    console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
    console.log("  - 用户 ID:", user?.id || "无")
    console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
    console.log("  - 聊天次数:", chatCount)
    console.log("🚪 [操作] 开始退出登录流程...")
    console.log("========================================")
    
    // 先释放 loadUserData 的锁，确保后续调用能正常执行
    console.log("🔓 [操作] 释放 loadUserData 锁...")
    loadUserDataLockRef.current = false
    setIsLoadingMembership(false) // 立即清除加载状态
    console.log("✅ [操作] 锁已释放，加载状态已清除")
    
    // 先清除 localStorage 中的聊天记录
    if (typeof window !== "undefined") {
      // 清除所有可能的聊天记录键
      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('chat_count_'))
      keysToRemove.forEach(k => localStorage.removeItem(k))
      console.log("🧹 [清理] 已清除 localStorage 聊天记录，共", keysToRemove.length, "条")
    }
    
    // 立即清除状态，防止在 signOut 期间仍然显示会员
    console.log("🔄 [状态] 立即清除用户状态...")
    setUser(null)
    setMembership({
      type: "guest",
      label: "游客",
      dailyLimit: 3,
      hasUnlimited: false,
    })
    setChatCount(0)
    console.log("✅ [状态] 用户状态已清除")
    
    // 退出登录
    try {
      // 先退出登录，确保 cookies 被清除
      console.log("🔐 [操作] 调用 Supabase signOut...")
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error("❌ [错误] 退出登录失败:", error)
        // 即使出错也刷新页面
      } else {
        console.log("✅ [成功] Supabase 退出登录成功")
      }
      
      // 等待一小段时间确保 cookies 已清除，然后刷新页面
      console.log("⏳ [等待] 等待 100ms 确保 cookies 清除...")
      setTimeout(() => {
        console.log("🔄 [刷新] 开始刷新页面...")
        console.log("  - 目标 URL:", window.location.origin + window.location.pathname)
        console.log("========================================")
        if (typeof window !== "undefined") {
          // 强制刷新，不使用缓存
          window.location.href = window.location.origin + window.location.pathname
        }
      }, 100)
    } catch (err) {
      console.error("❌ [异常] 退出登录过程出错:", err)
      console.log("========================================")
      // 即使出错也刷新页面
      if (typeof window !== "undefined") {
        window.location.href = window.location.origin + window.location.pathname
      }
    }
  }

  return (
    <>
    <main className="flex flex-col h-screen bg-background text-foreground font-sans">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white/50 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xl hover:bg-primary/20 transition-colors cursor-pointer"
                suppressHydrationWarning
              >
                {isChatRoomMode ? "🏠" : mode === "image" ? "创" : mode === "vision" ? "识" : mode === "video" ? "视" : selectedCharacter.avatar}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {(mode === "image" || mode === "vision" || mode === "video") ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  {mode === "image" ? "创作" : mode === "vision" ? "识图" : "视频"}模式下无法选择角色
          </div>
              ) : (
                <>
                  <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                    系统角色
          </div>
                  {CHARACTERS.map((character) => (
                    <DropdownMenuItem
                      key={character.id}
                      onClick={() => handleCharacterChange(character.id)}
                      className="flex items-center gap-3 cursor-pointer"
                    >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                    {character.avatar}
        </div>
                  <div className="flex-1">
                    <div className="font-medium">{character.name}</div>
                    <div className="text-xs text-muted-foreground">{character.description}</div>
                  </div>
                  {!isChatRoomMode && selectedCharacter.id === character.id && (
                    <span className="text-primary text-xs">✓</span>
                  )}
                </DropdownMenuItem>
              ))}
              {/* 自定义智能体 */}
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                我的智能体
          </div>
              {customAgents.length > 0 ? (
                customAgents.map((character) => (
                  <DropdownMenuItem
                    key={character.id}
                    onClick={() => handleCharacterChange(character.id)}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {character.avatar}
      </div>
                <div className="flex-1">
                  <div className="font-medium">{character.name}</div>
                  <div className="text-xs text-muted-foreground">{character.description || "自定义智能体"}</div>
                </div>
                {!isChatRoomMode && selectedCharacter.id === character.id && (
                  <span className="text-primary text-xs">✓</span>
                )}
              </DropdownMenuItem>
            ))
              ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  暂无自定义智能体
          </div>
              )}
              {user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsCreateAgentDialogOpen(true)}
                    className="flex items-center gap-3 cursor-pointer text-primary"
                  >
                    <span className="text-lg">+</span>
                    <span className="font-medium">创建智能体</span>
                  </DropdownMenuItem>
                </>
              )}
              {/* 聊天室选项（所有人可见，但仅会员可用，创作、识图和视频模式下禁用） */}
              {mode === "companion" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      console.log("========================================")
                      console.log("🏠 [用户操作] 点击聊天室按钮")
                      console.log("  - 会员状态:", membership?.type)
                      console.log("========================================")
                      
                      // 检查是否是会员
                      const isMember = membership && (membership.type === "member" || membership.type === "lifetime")
                      
                      if (!isMember) {
                        // 非会员，提示需要充值
                        const shouldUpgrade = confirm(
                          "聊天室功能仅限会员使用。\n\n是否前往升级会员？"
                        )
                        if (shouldUpgrade) {
                          router.push("/pricing")
                        }
                        return
                      }
                      
                      // 会员，进入聊天室
                      setIsChatRoomMode(true)
                      setIsSelectingCharacters(true)
                      setInvitedCharacters([])
                      setMessages([])
                    }}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                      🏠
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">聊天室</div>
                      <div className="text-xs text-muted-foreground">
                        {membership?.type === "member" || membership?.type === "lifetime"
                          ? "邀请多个角色一起聊天"
                          : "仅限会员使用"}
                      </div>
                    </div>
                    {(membership?.type !== "member" && membership?.type !== "lifetime") && (
                      <span className="text-xs text-muted-foreground">🔒</span>
                    )}
                  </DropdownMenuItem>
                </>
              )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <div suppressHydrationWarning>
            {isChatRoomMode ? (
              <>
                <h1 className="font-bold text-lg leading-tight">聊天室</h1>
                <p className="text-xs text-muted-foreground font-medium">
                  {invitedCharacters.length > 0
                    ? `已邀请 ${invitedCharacters.length} 个角色`
                    : "邀请多个角色一起聊天"}
                </p>
              </>
            ) : (
              <>
                <h1 className="font-bold text-lg leading-tight">
                  {mode === "image" ? "创作" : mode === "vision" ? "识图" : mode === "video" ? "视频" : selectedCharacter.name}
                </h1>
                <p className="text-xs text-muted-foreground font-medium">
                  {mode === "image" ? "AI 图片生成助手" : mode === "vision" ? "AI 图片识别助手" : mode === "video" ? "AI 视频生成助手" : selectedCharacter.description}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* 导航链接 */}
          <div className="flex items-center gap-2 mr-2">
            <Link href="/community">
              <Button variant="ghost" size="sm">
                社区
              </Button>
            </Link>
            {user && (
              <>
                <Link href="/profile/artworks">
                  <Button variant="ghost" size="sm">
                    我的作品
                  </Button>
                </Link>
                <Link href="/profile/agents">
                  <Button variant="ghost" size="sm">
                    我的智能体
                  </Button>
                </Link>
              </>
            )}
          </div>
          {membership && (
            <div className="flex items-center gap-2">
              <Badge variant={membership.type === "lifetime" ? "default" : membership.type === "member" ? "secondary" : "outline"}>
                {membership.label}
              </Badge>
              {membership.type === "member" && membership.expiresAt && (
                <span className="text-xs text-muted-foreground">
                  到期: {new Date(membership.expiresAt).toLocaleDateString('zh-CN')}
                </span>
              )}
            </div>
          )}
          {membership && !membership.hasUnlimited && (
            <span className="text-xs text-muted-foreground">
              {Math.min(chatCount, membership.dailyLimit)}/{membership.dailyLimit}
            </span>
          )}
          {user ? (
            <>
              {/* 会员（member）显示续费按钮 */}
              {membership?.type === "member" && (
                <>
                  {isLoadingMembership ? (
                    <span className="text-xs text-muted-foreground">
                      查询会员信息中...
                    </span>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        console.log("========================================")
                        console.log("🟡 [用户操作] 点击续费按钮")
                        console.log("📍 [环境信息]")
                        console.log("  - 当前域名:", window.location.origin)
                        console.log("  - 当前路径:", window.location.pathname)
                        console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
                        console.log("  - 用户 ID:", user?.id || "无")
                        console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
                        console.log("  - 聊天次数:", chatCount)
                        console.log("🚀 [操作] 跳转到定价页面...")
                        console.log("========================================")
                        router.push("/pricing")
                      }}
                      className="text-xs"
                    >
                      续费
                    </Button>
                  )}
                </>
              )}
              {/* 非会员且非永久会员显示升级会员按钮 */}
              {membership?.type !== "member" && membership?.type !== "lifetime" && (
                <>
                  {isLoadingMembership ? (
                    <span className="text-xs text-muted-foreground">
                      查询会员信息中...
                    </span>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => {
                        console.log("========================================")
                        console.log("🟡 [用户操作] 点击升级会员按钮")
                        console.log("📍 [环境信息]")
                        console.log("  - 当前域名:", window.location.origin)
                        console.log("  - 当前路径:", window.location.pathname)
                        console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
                        console.log("  - 用户 ID:", user?.id || "无")
                        console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
                        console.log("  - 聊天次数:", chatCount)
                        console.log("🚀 [操作] 跳转到定价页面...")
                        console.log("========================================")
                        router.push("/pricing")
                      }}
                      className="text-xs"
                    >
                      升级会员
                    </Button>
                  )}
                </>
              )}
              {/* 永久会员不显示任何按钮 */}
              <span className="text-xs text-muted-foreground max-w-[120px] truncate">
                {user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLogout}
                className="text-xs"
              >
                退出登录
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={handleGoogleLogin}
              className="text-xs"
            >
              登录
            </Button>
          )}
        <div className="flex items-center gap-2">
          {/* 历史记录按钮（所有模式都显示，但非聊天室模式） */}
          {!isChatRoomMode && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsHistorySidebarOpen(true)}
              className="h-8 w-8"
              title="历史记录"
            >
              <History className="h-4 w-4" />
            </Button>
          )}
          
          {/* 重新开始按钮 */}
        <button
            onClick={() => {
              console.log("========================================")
              console.log("🟢 [用户操作] 点击重新开始按钮")
              console.log("📍 [环境信息]")
              console.log("  - 当前域名:", window.location.origin)
              console.log("  - 当前路径:", window.location.pathname)
              console.log("  - 用户状态:", user ? `已登录 (${user.email})` : "未登录")
              console.log("  - 用户 ID:", user?.id || "无")
              console.log("  - 会员状态:", membership ? `${membership.type} (${membership.label})` : "未知")
              console.log("  - 聊天次数:", chatCount)
              console.log("  - 当前消息数:", messages.length)
              console.log("  - 当前会话ID:", currentHistoryIdRef.current)
              console.log("🧹 [操作] 保存当前聊天记录并清除消息...")
              console.log("========================================")
              
              // 如果有消息且已经开始聊天，保存到历史记录
              if (hasStartedChatRef.current && messages.length > 1) {
                const characterId = mode === "companion" ? selectedCharacter.id : "system"
                const characterName = mode === "companion" ? selectedCharacter.name : (mode === "image" ? "创作" : mode === "vision" ? "识图" : "视频")
                
                const historyId = currentHistoryIdRef.current
                  ? updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
                    ? currentHistoryIdRef.current
                    : saveChatHistory(
                        user?.id || null,
                        characterId,
                        characterName,
                        mode,
                        messages
                      )
                  : saveChatHistory(
                      user?.id || null,
                      characterId,
                      characterName,
                      mode,
                      messages
                    )
                
                console.log("💾 [历史记录] 已保存，会话ID:", historyId)
              }
              
              // 重置状态
              currentHistoryIdRef.current = null
              hasStartedChatRef.current = false
              
              // 根据当前模式设置欢迎消息，不改变模式
              if (mode === "companion") {
                // 陪伴模式：使用角色欢迎消息
                setMessages([{
                  id: "welcome",
                  role: "assistant",
                  content: selectedCharacter.welcomeMessage,
                  characterId: selectedCharacter.id,
                  characterName: selectedCharacter.name,
                }])
              } else if (mode === "image") {
                // 创作模式
                setImageMessages([{
                  id: "welcome-image",
                  role: "assistant",
                  content: "你好！我是创作助手，可以帮你生成各种图片。请描述你想要生成的图片内容。",
                }])
              } else if (mode === "vision") {
                // 识图模式
                setVisionMessages([{
                  id: "welcome-vision",
                  role: "assistant",
                  content: "你好！我是识图助手，可以帮你分析图片内容。请上传图片并告诉我你想了解什么。",
                }])
              } else if (mode === "video") {
                // 视频模式
                setVideoMessages([{
                  id: "welcome-video",
                  role: "assistant",
                  content: "你好！我是视频生成助手，可以帮你生成视频。请上传图片或输入描述。",
                }])
              }
              console.log("✅ [完成] 聊天消息已清除，重置为欢迎消息，模式:", mode)
              
              // 刷新聊天次数显示（但不影响会员状态）
              const refreshCount = async () => {
                try {
                  const count = await getTodayChatCount(user?.id || null)
                  const limitedCount = membership?.hasUnlimited ? count : Math.min(count, membership?.dailyLimit || Infinity)
                  setChatCount(limitedCount)
                  console.log("✅ [完成] 聊天次数已刷新:", limitedCount)
                } catch (error) {
                  console.error("❌ [错误] 刷新聊天次数失败:", error)
                }
              }
              refreshCount()
            }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          重新开始
        </button>
        </div>
        </div>
      </header>

      {/* Chat Container */}
      {isSelectingCharacters ? (
        // 角色选择界面
        <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl mx-auto w-full">
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">选择要邀请的角色</h3>
            <p className="text-sm text-muted-foreground mb-4">
              选择你想要一起聊天的角色，至少选择一个
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {CHARACTERS.map((character) => (
              <div
                key={character.id}
                className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                  invitedCharacters.includes(character.id)
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => {
                  setInvitedCharacters((prev) =>
                    prev.includes(character.id)
                      ? prev.filter((id) => id !== character.id)
                      : [...prev, character.id]
                  )
                }}
              >
                <Checkbox
                  checked={invitedCharacters.includes(character.id)}
                  onCheckedChange={() => {
                    setInvitedCharacters((prev) =>
                      prev.includes(character.id)
                        ? prev.filter((id) => id !== character.id)
                        : [...prev, character.id]
                    )
                  }}
                />
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                  {character.avatar}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{character.name}</div>
                  <div className="text-xs text-muted-foreground">{character.description}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsChatRoomMode(false)
                setIsSelectingCharacters(false)
                setInvitedCharacters([])
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => {
                // 检查是否是会员
                const isMember = membership && (membership.type === "member" || membership.type === "lifetime")
                
                if (!isMember) {
                  const shouldUpgrade = confirm(
                    "聊天室功能仅限会员使用。\n\n是否前往升级会员？"
                  )
                  if (shouldUpgrade) {
                    router.push("/pricing")
                  }
                  return
                }
                
                if (invitedCharacters.length === 0) {
                  alert("请至少选择一个角色加入聊天室")
                  return
                }
                setIsSelectingCharacters(false)
                // 只在已邀请的角色中选择最热情的角色作为欢迎消息的发送者
                const invitedCharacterObjects = invitedCharacters
                  .map(id => CHARACTERS.find(c => c.id === id))
                  .filter(Boolean) as Character[]
                
                if (invitedCharacterObjects.length === 0) {
                  alert("请至少选择一个角色加入聊天室")
                  return
                }
                
                // 优先选择性格为"热情"的角色，如果没有则选择第一个
                const enthusiasticCharacter = invitedCharacterObjects.find(c => c.personality === "热情") 
                  || invitedCharacterObjects[0]
                
                const characterNames = invitedCharacterObjects
                  .map(c => c.name)
                  .join("、")
                
                // 分成两个气泡：先显示系统欢迎消息，再显示角色的个性化欢迎消息
                const welcomeMessages: Message[] = [
                  {
                    id: "welcome-system",
                    role: "assistant",
                    content: `欢迎来到聊天室！${characterNames}已经加入。`,
                    // 系统消息不设置角色ID和角色名
                  },
                ]
                
                // 如果有角色，添加角色的个性化欢迎消息
                if (enthusiasticCharacter) {
                  welcomeMessages.push({
                    id: "welcome-character",
                    role: "assistant",
                    content: enthusiasticCharacter.welcomeMessage,
                    characterId: enthusiasticCharacter.id,
                    characterName: enthusiasticCharacter.name,
                  })
                }
                
                // 聊天室消息应该设置到陪伴模式的消息列表
                setCompanionMessages(welcomeMessages)
              }}
              disabled={invitedCharacters.length === 0}
            >
              进入聊天室
            </Button>
          </div>
        </div>
      ) : (
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-8 space-y-2 max-w-2xl mx-auto w-full scrollbar-hide"
      >
          {messages.length === 1 && messages[0].id === "welcome" && !isChatRoomMode && mode === "companion" && (
          <div className="mb-8 text-center animate-in fade-in duration-700">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
              对话已安全加密 • 仅限本地会话
            </p>
          </div>
        )}

        {messages.map((message, index) => {
          // 获取提示词：对于图片，从之前的用户消息中获取；对于视频，为 null
          let prompt: string | null = null
          if (message.imageUrl || message.videoUrl) {
            if (message.videoUrl) {
              // 视频不需要提示词
              prompt = null
            } else if (message.imageUrl) {
              // 图片：查找之前的用户消息作为提示词
              for (let i = index - 1; i >= 0; i--) {
                if (messages[i].role === "user" && messages[i].content) {
                  prompt = messages[i].content
                  break
                }
              }
            }
          }

          return (
            <ChatMessage 
              key={message.id} 
              role={message.role} 
              content={message.content}
              characterId={isChatRoomMode ? message.characterId : (message.characterId || selectedCharacter.id)}
              characterName={isChatRoomMode ? message.characterName : (message.characterName || selectedCharacter.name)}
              showCharacterName={isChatRoomMode ? true : (message.role === "assistant" && !!(message.characterName || message.characterId))}
              imageUrl={message.imageUrl}
              userImageUrl={message.userImageUrl}
              videoUrl={message.videoUrl}
              userId={user?.id || null}
              messageId={message.id}
              prompt={prompt}
            />
          )
        })}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start animate-pulse">
            <div className="bg-white px-4 py-2 rounded-2xl rounded-tl-none border border-border text-muted-foreground text-sm italic">
                {mode === "image" 
                  ? "正在生成图片..." 
                  : mode === "vision"
                    ? "正在分析图片..."
                    : mode === "video"
                      ? "正在生成视频..."
                      : isChatRoomMode 
                        ? "正在思考..." 
                        : `${selectedCharacter.name}正在认真思考...`}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Input Area */}
      {!isSelectingCharacters && (
      <footer className="flex-shrink-0 p-4 pb-8 max-w-2xl mx-auto w-full">
          <ChatInput 
            onSend={handleSend} 
            disabled={isLoading} 
            mode={mode}
            placeholder={mode === "image" ? "输入描述，AI 将为您生成图片" : mode === "vision" ? "上传图片并输入问题，AI 将为您分析" : mode === "video" ? "上传图片或输入描述，AI 将为您生成视频" : "在这里倾诉你的心声..."}
            modeSelector={
              <>
                <Button
                  variant={mode === "companion" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // 保存当前模式的历史记录
                    if (!isChatRoomMode && hasStartedChatRef.current && currentHistoryIdRef.current && messages.length > 1) {
                      updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
                    }
                    
                    setMode("companion")
                    // 切换到陪伴模式时，如果正在聊天室模式，保持聊天室模式
                    // 如果不在聊天室模式，保持当前状态
                    // 消息列表会自动切换到 companionMessages
                    
                    // 陪伴模式不使用自动加载历史记录ID，因为陪伴模式可以有多个历史记录
                    // 如果需要加载历史记录，用户需要手动从历史记录侧边栏选择
                    if (!isChatRoomMode) {
                      currentHistoryIdRef.current = null
                      hasStartedChatRef.current = false
                    }
                  }}
                >
                  陪伴
                </Button>
                <Button
                  variant={mode === "image" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // 保存当前模式的历史记录
                    if (!isChatRoomMode && hasStartedChatRef.current && currentHistoryIdRef.current && messages.length > 1) {
                      updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
                    }
                    
                    setMode("image")
                    // 切换到创作模式时，退出聊天室模式
                    if (isChatRoomMode) {
                      setIsChatRoomMode(false)
                      setIsSelectingCharacters(false)
                      setInvitedCharacters([])
                    }
                    
                    // 加载创作模式的历史记录ID（如果存在）
                    const histories = loadChatHistories(user?.id || null)
                    const imageHistory = histories.find(h => h.mode === "image")
                    if (imageHistory) {
                      currentHistoryIdRef.current = imageHistory.id
                      hasStartedChatRef.current = true
                    } else {
                      currentHistoryIdRef.current = null
                      hasStartedChatRef.current = false
                    }
                    
                    // 如果创作模式还没有欢迎消息，添加一个
                    if (imageMessages.length === 0) {
                      setImageMessages([{
                        id: "welcome-image",
                        role: "assistant",
                        content: "你好！我是创作助手，可以帮你生成各种图片。请描述你想要生成的图片内容。",
                      }])
                    }
                    // 消息列表会自动切换到 imageMessages
                  }}
                >
                  创作
                </Button>
                <Button
                  variant={mode === "vision" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // 保存当前模式的历史记录
                    if (!isChatRoomMode && hasStartedChatRef.current && currentHistoryIdRef.current && messages.length > 1) {
                      updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
                    }
                    
                    setMode("vision")
                    // 切换到识图模式时，退出聊天室模式
                    if (isChatRoomMode) {
                      setIsChatRoomMode(false)
                      setIsSelectingCharacters(false)
                      setInvitedCharacters([])
                    }
                    
                    // 加载识图模式的历史记录ID（如果存在）
                    const histories = loadChatHistories(user?.id || null)
                    const visionHistory = histories.find(h => h.mode === "vision")
                    if (visionHistory) {
                      currentHistoryIdRef.current = visionHistory.id
                      hasStartedChatRef.current = true
                    } else {
                      currentHistoryIdRef.current = null
                      hasStartedChatRef.current = false
                    }
                    
                    // 如果识图模式还没有欢迎消息，添加一个
                    if (visionMessages.length === 0) {
                      setVisionMessages([{
                        id: "welcome-vision",
                        role: "assistant",
                        content: "你好！我是识图助手，可以帮你分析图片内容。请上传图片并告诉我你想了解什么。",
                      }])
                    }
                    // 消息列表会自动切换到 visionMessages
                  }}
                >
                  识图
                </Button>
                <Button
                  variant={mode === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    // 保存当前模式的历史记录
                    if (!isChatRoomMode && hasStartedChatRef.current && currentHistoryIdRef.current && messages.length > 1) {
                      updateChatHistory(user?.id || null, currentHistoryIdRef.current, messages)
                    }
                    
                    setMode("video")
                    // 切换到视频模式时，退出聊天室模式
                    if (isChatRoomMode) {
                      setIsChatRoomMode(false)
                      setIsSelectingCharacters(false)
                      setInvitedCharacters([])
                    }
                    
                    // 加载视频模式的历史记录ID（如果存在）
                    const histories = loadChatHistories(user?.id || null)
                    const videoHistory = histories.find(h => h.mode === "video")
                    if (videoHistory) {
                      currentHistoryIdRef.current = videoHistory.id
                      hasStartedChatRef.current = true
                    } else {
                      currentHistoryIdRef.current = null
                      hasStartedChatRef.current = false
                    }
                    
                    // 如果视频模式还没有欢迎消息，添加一个
                    if (videoMessages.length === 0) {
                      setVideoMessages([{
                        id: "welcome-video",
                        role: "assistant",
                        content: "你好！我是视频生成助手，可以帮你生成视频。你可以上传图片或输入描述，我会为你生成视频。",
                      }])
                    }
                    // 消息列表会自动切换到 videoMessages
                  }}
                >
                  视频
                </Button>
              </>
            }
          />
        <p className="text-[10px] text-center text-muted-foreground/40 mt-4 px-8 leading-normal">
            {mode === "image" 
              ? "输入描述，AI 将为您生成图片" 
              : mode === "vision"
                ? "上传图片，AI 将为您分析"
                : mode === "video"
                  ? "上传图片或输入描述，AI 将为您生成视频"
                  : isChatRoomMode 
                    ? "聊天室" 
                    : selectedCharacter.name}致力于提供情感陪伴。如果你需要专业心理帮助,请咨询相关医疗机构。
        </p>
      </footer>
      )}

    </main>

    {/* 历史记录侧边栏 */}
    <ChatHistorySidebar
      userId={user?.id || null}
      isOpen={isHistorySidebarOpen}
      onClose={() => setIsHistorySidebarOpen(false)}
      onSelectHistory={handleSelectHistory}
      currentHistoryId={currentHistoryIdRef.current || undefined}
      mode={mode}
    />

    {/* 创建智能体对话框 */}
    {user && (
      <CreateAgentDialog
        open={isCreateAgentDialogOpen}
        onOpenChange={setIsCreateAgentDialogOpen}
        onSuccess={async () => {
          // 重新加载自定义智能体
          if (user) {
            try {
              const allChars = await getAllCharacters(user.id)
              setAllCharacters(allChars)
              const customChars = allChars.filter(c => c.isCustom)
              setCustomAgents(customChars)
            } catch (error) {
              console.error("重新加载自定义智能体失败:", error)
            }
          }
        }}
      />
    )}
    </>
  )
}
