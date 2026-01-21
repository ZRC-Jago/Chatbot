// 角色配置
export interface Character {
  id: string
  name: string
  gender?: "male" | "female" // 自定义智能体可能没有
  personality?: string // 自定义智能体可能没有
  description?: string
  voice: string // SiliconFlow voice ID
  avatar: string // 头像显示的文字
  welcomeMessage: string
  systemPrompt?: string // 自定义系统提示词（用于自定义智能体）
  isCustom?: boolean // 标记是否为自定义智能体
  userId?: string // 自定义智能体的所有者
}

export const CHARACTERS: Character[] = [
  {
    id: "acheng",
    name: "阿城",
    gender: "male",
    personality: "温暖",
    description: "温暖的倾听者",
    voice: "fnlp/MOSS-TTSD-v0.5:benjamin",
    avatar: "城",
    welcomeMessage: "你好呀。我是阿城,很高兴能在这里遇见你。不管你现在心情如何,我都愿意陪你聊聊天。你最近过得还好吗?",
  },
  {
    id: "yage",
    name: "亚戈",
    gender: "male",
    personality: "热情",
    description: "热情的陪伴者",
    voice: "fnlp/MOSS-TTSD-v0.5:alex",
    avatar: "戈",
    welcomeMessage: "你好！我是亚戈，很高兴认识你！我性格比较热情，喜欢和人聊天。你今天过得怎么样？有什么想聊的吗？",
  },
  {
    id: "tongtong",
    name: "童童",
    gender: "female",
    personality: "腼腆",
    description: "腼腆的倾听者",
    voice: "fnlp/MOSS-TTSD-v0.5:diana",
    avatar: "童",
    welcomeMessage: "你好...我是童童。我有点害羞，但我会认真听你说话的。你有什么想和我分享的吗？",
  },
  {
    id: "xinxin",
    name: "欣欣",
    gender: "female",
    personality: "理性知心",
    description: "理性知心的朋友",
    voice: "fnlp/MOSS-TTSD-v0.5:bella",
    avatar: "欣",
    welcomeMessage: "你好，我是欣欣。我比较理性，但也很愿意倾听你的想法和感受。有什么想聊的吗？",
  },
]

// 获取默认角色（阿城）
export function getDefaultCharacter(): Character {
  return CHARACTERS[0]
}

// 根据ID获取角色（从系统角色中查找）
export function getCharacterById(id: string): Character | null {
  return CHARACTERS.find(c => c.id === id) || null
}

// 获取角色存储的key
export const CHARACTER_STORAGE_KEY = "selected_character_id"

// 从数据库记录转换为 Character 对象
export function convertAgentToCharacter(agent: any): Character {
  return {
    id: agent.id,
    name: agent.name,
    voice: agent.voice,
    avatar: agent.avatar || agent.name[0],
    welcomeMessage: agent.welcome_message || `你好，我是${agent.name}。有什么可以帮助你的吗？`,
    systemPrompt: agent.system_prompt,
    isCustom: true,
    userId: agent.user_id,
    description: agent.description || "",
  }
}

// 合并系统角色和自定义智能体
export async function getAllCharacters(userId: string | null): Promise<Character[]> {
  const systemCharacters = CHARACTERS
  
  if (!userId) {
    return systemCharacters
  }
  
  try {
    // 从API获取用户的自定义智能体
    const response = await fetch("/api/agents")
    if (!response.ok) {
      console.error("获取自定义智能体失败:", response.statusText)
      return systemCharacters
    }
    
    const { data: customAgents } = await response.json()
    if (!customAgents || !Array.isArray(customAgents)) {
      return systemCharacters
    }
    
    // 转换为Character格式
    const customCharacters = customAgents.map(convertAgentToCharacter)
    
    return [...systemCharacters, ...customCharacters]
  } catch (error) {
    console.error("加载自定义智能体错误:", error)
    return systemCharacters
  }
}

// 根据ID获取角色（支持系统角色和自定义智能体）
export async function getCharacterByIdAsync(id: string, userId: string | null): Promise<Character | null> {
  // 先查系统角色
  const systemCharacter = CHARACTERS.find(c => c.id === id)
  if (systemCharacter) {
    return systemCharacter
  }
  
  // 如果是自定义智能体，从数据库查询
  if (!userId) {
    return null
  }
  
  try {
    const response = await fetch(`/api/agents/${id}`)
    if (!response.ok) {
      return null
    }
    
    const { data: agent } = await response.json()
    if (!agent) {
      return null
    }
    
    return convertAgentToCharacter(agent)
  } catch (error) {
    console.error("获取自定义智能体错误:", error)
    return null
  }
}

// 音色选项列表（用于创建自定义智能体）
export const VOICE_OPTIONS = [
  { value: "fnlp/MOSS-TTSD-v0.5:alex", label: "Alex (男声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:anna", label: "Anna (女声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:bella", label: "Bella (女声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:benjamin", label: "Benjamin (男声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:charles", label: "Charles (男声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:claire", label: "Claire (女声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:david", label: "David (男声)" },
  { value: "fnlp/MOSS-TTSD-v0.5:diana", label: "Diana (女声)" },
]



