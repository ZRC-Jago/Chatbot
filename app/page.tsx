"use client"

import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { getUserMembership, getTodayChatCount, incrementChatCount, type MembershipInfo } from "@/lib/membership"
import { CHARACTERS, getCharacterById, getDefaultCharacter, CHARACTER_STORAGE_KEY, type Character } from "@/lib/characters"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  characterId?: string // 聊天室模式：角色ID
  characterName?: string // 聊天室模式：角色名字
}

export default function ChatPage() {
  // 始终使用默认角色作为初始值，避免 hydration mismatch
  // 在 useEffect 中从 localStorage 加载保存的角色
  const defaultCharacter = getDefaultCharacter()
  const [selectedCharacter, setSelectedCharacter] = useState<Character>(defaultCharacter)
  const [isCharacterLoaded, setIsCharacterLoaded] = useState(false) // 标记是否已从 localStorage 加载
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: defaultCharacter.welcomeMessage,
      characterId: defaultCharacter.id,
      characterName: defaultCharacter.name,
    },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [chatCount, setChatCount] = useState(0)
  const [isLoadingMembership, setIsLoadingMembership] = useState(false) // 会员信息加载状态
  const scrollRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()
  const router = useRouter()
  const loadUserDataLockRef = useRef(false) // 防止重复加载的锁
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 页面可见性定时器
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 页面焦点定时器
  const sendMessageLockRef = useRef(false) // 防止重复发送消息的锁
  const [isChatRoomMode, setIsChatRoomMode] = useState(false) // 是否在聊天室模式
  const [invitedCharacters, setInvitedCharacters] = useState<string[]>([]) // 已邀请的角色ID列表
  const [isSelectingCharacters, setIsSelectingCharacters] = useState(false) // 是否在选择角色阶段
  const [chatRoomMessages, setChatRoomMessages] = useState<Message[]>([]) // 聊天室消息

  // 切换角色的函数
  const handleCharacterChange = (characterId: string) => {
    const character = getCharacterById(characterId)
    if (character) {
      console.log("========================================")
      console.log("🎭 [用户操作] 切换角色")
      console.log("  - 新角色:", character.name)
      console.log("  - 性格:", character.personality)
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
        const character = getCharacterById(savedCharacterId)
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
  }, [isCharacterLoaded, selectedCharacter.id])

  useEffect(() => {
    console.log("🚀 [v0] useEffect 执行，初始化页面")
    
    // 首次加载 - 等待 session 恢复后再加载数据（页面刷新时）
    const initLoad = async () => {
      // 等待一小段时间确保 Supabase session 已恢复（页面刷新时）
      console.log("⏳ [v0] 首次加载，等待 session 恢复...")
      await new Promise(resolve => setTimeout(resolve, 200))
      console.log("✅ [v0] 开始加载用户数据...")
      await loadUserData()
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

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
      // 清理定时器
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current)
        visibilityTimeoutRef.current = null
      }
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = null
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

  const handleSend = async (content: string) => {
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

    sendMessageLockRef.current = true

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
    
    // 如果是聊天室模式，跳过会员信息加载等待（聊天室不限制次数）
    if (isChatRoomMode && invitedCharacters.length > 0) {
      console.log("🏠 [聊天室] 检测到聊天室模式，跳过会员信息检查")
    } else if (isLoadingMembership) {
      console.log("⏳ [等待] 会员信息正在加载，等待完成...")
      let waitCount = 0
      const maxWait = 10 // 最多等待1秒（10 * 100ms）
      while (isLoadingMembership && waitCount < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100))
        waitCount++
      }
      if (isLoadingMembership) {
        console.log("⚠️ [警告] 会员信息加载超时，强制清除加载状态和锁...")
        // 强制清除加载状态和锁，防止卡死
        setIsLoadingMembership(false)
        loadUserDataLockRef.current = false
        console.log("✅ [恢复] 已强制清除状态，继续执行发送消息...")
      } else {
        console.log("✅ [完成] 会员信息加载完成")
      }
    }
    
    // 先检查用户是否真的已登录（防止退出登录后状态未更新）
    const { data: { user: currentUser } } = await supabase.auth.getUser()
    
    // 如果检测到用户已退出但状态未更新，更新状态而不是刷新页面
    if (!currentUser && user) {
      console.log("⚠️ [状态] 检测到用户已退出但状态未更新，更新状态...")
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
      // 继续执行，但使用游客状态
    }
    
    // 使用当前用户（如果存在）或 null
    const activeUser = currentUser || null
    
    // 先获取最新的聊天次数（确保数据是最新的）
    const currentCount = await getTodayChatCount(activeUser?.id || null)
    setChatCount(currentCount)
    
    // 重新获取会员信息（确保是最新的，但只在会员信息未加载时）
    // 退出登录后，会员信息应该是游客，不需要重新查询
    if (!isLoadingMembership && activeUser) {
      const currentMembership = await getUserMembership()
      setMembership(currentMembership)
    } else if (!activeUser) {
      // 如果用户未登录，直接使用游客状态
      const guestMembership = {
        type: "guest" as const,
        label: "游客",
        dailyLimit: 3,
        hasUnlimited: false,
      }
      setMembership(guestMembership)
    }
    
    // 使用当前的会员信息检查限制
    const checkMembership = membership || {
      type: "guest" as const,
      label: "游客",
      dailyLimit: 3,
      hasUnlimited: false,
    }
    
    // 检查聊天次数限制
    if (checkMembership && !checkMembership.hasUnlimited && currentCount >= checkMembership.dailyLimit) {
      sendMessageLockRef.current = false // 释放锁
      alert(`今日聊天次数已达上限（${checkMembership.dailyLimit}次）。${checkMembership.type === "guest" ? "请登录以获取更多次数，或升级为会员享受无限对话。" : "请升级为会员享受无限对话。"}`)
      return
    }
    
    console.log("✅ [验证] 通过所有检查，开始发送消息...")

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
        const response = await fetch("/api/chat-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [...messages, userMessage].map((m) => ({
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
        sendMessageLockRef.current = false
      }
      return
    } else if (isChatRoomMode) {
      console.log("⚠️ [聊天室] 聊天室模式但条件不满足:")
      console.log("  - isChatRoomMode:", isChatRoomMode)
      console.log("  - invitedCharacters.length:", invitedCharacters.length)
      console.log("  - isSelectingCharacters:", isSelectingCharacters)
      sendMessageLockRef.current = false
      return
    }

    // 普通聊天模式
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    }

    setMessages((prev) => [...prev, userMessage])
    setIsLoading(true)

    let accumulatedContent = ""
    let assistantMessageCreated = false
    const assistantId = (Date.now() + 1).toString()

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          characterId: selectedCharacter.id,
        }),
      })

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
      sendMessageLockRef.current = false // 释放发送锁
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
                {isChatRoomMode ? "🏠" : selectedCharacter.avatar}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground">
                选择角色
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
              {/* 聊天室选项（所有人可见，但仅会员可用） */}
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
                <h1 className="font-bold text-lg leading-tight">{selectedCharacter.name}</h1>
                <p className="text-xs text-muted-foreground font-medium">{selectedCharacter.description}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
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
              console.log("🧹 [操作] 清除聊天消息，保留用户状态和会员信息...")
              console.log("========================================")
              
              // 只清除聊天消息，不清除用户状态和会员信息
              setMessages([{
                id: "welcome",
                role: "assistant",
                content: selectedCharacter.welcomeMessage,
                characterId: selectedCharacter.id,
                characterName: selectedCharacter.name,
              }])
              console.log("✅ [完成] 聊天消息已清除，重置为欢迎消息")
              
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
                
                setMessages(welcomeMessages)
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
          {messages.length === 1 && messages[0].id === "welcome" && !isChatRoomMode && (
            <div className="mb-8 text-center animate-in fade-in duration-700">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                对话已安全加密 • 仅限本地会话
              </p>
            </div>
          )}

          {messages.map((message) => (
            <ChatMessage 
              key={message.id} 
              role={message.role} 
              content={message.content}
              characterId={isChatRoomMode ? message.characterId : (message.characterId || selectedCharacter.id)}
              characterName={isChatRoomMode ? message.characterName : (message.characterName || selectedCharacter.name)}
              showCharacterName={isChatRoomMode || (message.role === "assistant" && (message.characterName || message.characterId))}
            />
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start animate-pulse">
              <div className="bg-white px-4 py-2 rounded-2xl rounded-tl-none border border-border text-muted-foreground text-sm italic">
                {isChatRoomMode ? "正在思考..." : `${selectedCharacter.name}正在认真思考...`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input Area */}
      {!isSelectingCharacters && (
        <footer className="flex-shrink-0 p-4 pb-8 max-w-2xl mx-auto w-full">
          <ChatInput onSend={handleSend} disabled={isLoading} />
          <p className="text-[10px] text-center text-muted-foreground/40 mt-4 px-8 leading-normal">
            {isChatRoomMode ? "聊天室" : selectedCharacter.name}致力于提供情感陪伴。如果你需要专业心理帮助,请咨询相关医疗机构。
          </p>
        </footer>
      )}

    </main>
  )
}
