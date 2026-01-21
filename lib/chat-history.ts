/**
 * 聊天历史记录管理
 * 存储结构：
 * - 每个用户的聊天历史存储在 localStorage 中
 * - key: `chat_history_${userId}` 或 `chat_history_guest`
 * - value: ChatHistory[] (聊天历史数组)
 */

export type ChatHistory = {
  id: string // 会话ID，使用时间戳生成
  characterId: string // 角色ID
  characterName: string // 角色名称
  mode: "companion" | "image" | "vision" | "video" // 聊天模式
  messages: Array<{
    id: string
    role: "user" | "assistant"
    content: string
    characterId?: string
    characterName?: string
    imageUrl?: string
    userImageUrl?: string
    videoUrl?: string
  }>
  createdAt: number // 创建时间戳
  updatedAt: number // 更新时间戳
  preview?: string // 预览文本（第一条用户消息或最后一条消息）
}

const MAX_HISTORY_COUNT = 100 // 最多保存100条历史记录
const HISTORY_STORAGE_PREFIX = "chat_history_"

/**
 * 获取存储key
 */
function getStorageKey(userId: string | null): string {
  return `${HISTORY_STORAGE_PREFIX}${userId || "guest"}`
}

/**
 * 保存聊天历史
 * 对于非陪伴模式（创作、识图、视频），每个模式只保存一条记录，记录一周的历史
 */
export function saveChatHistory(
  userId: string | null,
  characterId: string,
  characterName: string,
  mode: "companion" | "image" | "vision" | "video",
  messages: ChatHistory["messages"]
): string {
  if (typeof window === "undefined") return ""
  
  try {
    const storageKey = getStorageKey(userId)
    const histories = loadChatHistories(userId)
    
    // 对于非陪伴模式，查找是否已存在该模式的记录
    if (mode !== "companion") {
      const existingIndex = histories.findIndex(h => h.mode === mode)
      
      if (existingIndex !== -1) {
        // 已存在该模式的记录，更新它
        const existingHistory = histories[existingIndex]
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        
        // 如果记录超过一周，重置消息列表
        let updatedMessages = existingHistory.messages
        if (existingHistory.createdAt < oneWeekAgo) {
          updatedMessages = messages.filter(m => m.id !== "welcome")
        } else {
          // 合并新消息，去重
          const existingIds = new Set(existingHistory.messages.map(m => m.id))
          const newMessages = messages.filter(m => m.id !== "welcome" && !existingIds.has(m.id))
          updatedMessages = [...existingHistory.messages, ...newMessages]
        }
        
        histories[existingIndex] = {
          ...existingHistory,
          messages: updatedMessages,
          updatedAt: Date.now(),
          preview: getPreviewText(updatedMessages),
        }
        
        localStorage.setItem(storageKey, JSON.stringify(histories))
        console.log("💾 [历史记录] 更新非陪伴模式记录，模式:", mode, "会话ID:", existingHistory.id)
        return existingHistory.id
      }
    }
    
    // 创建新的历史记录
    const newHistory: ChatHistory = {
      id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      characterId,
      characterName,
      mode,
      messages: messages.filter(m => m.id !== "welcome"), // 排除欢迎消息
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preview: getPreviewText(messages),
    }
    
    // 添加到列表开头
    histories.unshift(newHistory)
    
    // 限制数量
    if (histories.length > MAX_HISTORY_COUNT) {
      histories.splice(MAX_HISTORY_COUNT)
    }
    
    // 保存到 localStorage
    localStorage.setItem(storageKey, JSON.stringify(histories))
    
    console.log("💾 [历史记录] 保存成功，会话ID:", newHistory.id)
    return newHistory.id
  } catch (error) {
    console.error("❌ [历史记录] 保存失败:", error)
    return ""
  }
}

/**
 * 更新聊天历史（用于继续对话）
 * 对于非陪伴模式，合并消息而不是替换
 */
export function updateChatHistory(
  userId: string | null,
  historyId: string,
  messages: ChatHistory["messages"]
): boolean {
  if (typeof window === "undefined") return false
  
  try {
    const storageKey = getStorageKey(userId)
    const histories = loadChatHistories(userId)
    
    const index = histories.findIndex(h => h.id === historyId)
    if (index === -1) return false
    
    const existingHistory = histories[index]
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    
    // 对于非陪伴模式，合并消息
    let updatedMessages = messages.filter(m => m.id !== "welcome")
    if (existingHistory.mode !== "companion") {
      // 如果记录超过一周，重置消息列表
      if (existingHistory.createdAt < oneWeekAgo) {
        updatedMessages = messages.filter(m => m.id !== "welcome")
      } else {
        // 合并新消息，去重
        const existingIds = new Set(existingHistory.messages.map(m => m.id))
        const newMessages = messages.filter(m => m.id !== "welcome" && !existingIds.has(m.id))
        updatedMessages = [...existingHistory.messages, ...newMessages]
      }
    }
    
    histories[index] = {
      ...existingHistory,
      messages: updatedMessages,
      updatedAt: Date.now(),
      preview: getPreviewText(updatedMessages),
    }
    
    localStorage.setItem(storageKey, JSON.stringify(histories))
    console.log("💾 [历史记录] 更新成功，会话ID:", historyId)
    return true
  } catch (error) {
    console.error("❌ [历史记录] 更新失败:", error)
    return false
  }
}

/**
 * 加载所有聊天历史
 */
export function loadChatHistories(userId: string | null): ChatHistory[] {
  if (typeof window === "undefined") return []
  
  try {
    const storageKey = getStorageKey(userId)
    const data = localStorage.getItem(storageKey)
    if (!data) return []
    
    const histories = JSON.parse(data) as ChatHistory[]
    // 按更新时间倒序排列
    return histories.sort((a, b) => b.updatedAt - a.updatedAt)
  } catch (error) {
    console.error("❌ [历史记录] 加载失败:", error)
    return []
  }
}

/**
 * 加载指定的聊天历史
 */
export function loadChatHistory(userId: string | null, historyId: string): ChatHistory | null {
  const histories = loadChatHistories(userId)
  return histories.find(h => h.id === historyId) || null
}

/**
 * 删除聊天历史
 */
export function deleteChatHistory(userId: string | null, historyId: string): boolean {
  if (typeof window === "undefined") return false
  
  try {
    const storageKey = getStorageKey(userId)
    const histories = loadChatHistories(userId)
    const filtered = histories.filter(h => h.id !== historyId)
    
    localStorage.setItem(storageKey, JSON.stringify(filtered))
    console.log("🗑️ [历史记录] 删除成功，会话ID:", historyId)
    return true
  } catch (error) {
    console.error("❌ [历史记录] 删除失败:", error)
    return false
  }
}

/**
 * 清空所有聊天历史
 */
export function clearChatHistories(userId: string | null): boolean {
  if (typeof window === "undefined") return false
  
  try {
    const storageKey = getStorageKey(userId)
    localStorage.removeItem(storageKey)
    console.log("🗑️ [历史记录] 清空成功")
    return true
  } catch (error) {
    console.error("❌ [历史记录] 清空失败:", error)
    return false
  }
}

/**
 * 获取预览文本（第一条用户消息或最后一条消息）
 */
function getPreviewText(messages: ChatHistory["messages"]): string {
  // 查找第一条用户消息
  const firstUserMessage = messages.find(m => m.role === "user")
  if (firstUserMessage) {
    return firstUserMessage.content.substring(0, 50)
  }
  
  // 如果没有用户消息，使用最后一条消息
  const lastMessage = messages[messages.length - 1]
  if (lastMessage) {
    return lastMessage.content.substring(0, 50)
  }
  
  return "新对话"
}

/**
 * 格式化时间显示
 */
export function formatHistoryTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  // 小于1分钟：刚刚
  if (diff < 60 * 1000) {
    return "刚刚"
  }
  
  // 小于1小时：X分钟前
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟前`
  }
  
  // 小于24小时：X小时前
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
  }
  
  // 小于7天：X天前
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`
  }
  
  // 超过7天：显示日期
  const date = new Date(timestamp)
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${month}月${day}日`
}
