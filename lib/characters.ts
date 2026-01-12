// 角色配置
export interface Character {
  id: string
  name: string
  gender: "male" | "female"
  personality: string
  description: string
  voice: string // SiliconFlow voice ID
  avatar: string // 头像显示的文字
  welcomeMessage: string
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

// 根据ID获取角色
export function getCharacterById(id: string): Character {
  return CHARACTERS.find(c => c.id === id) || getDefaultCharacter()
}

// 获取角色存储的key
export const CHARACTER_STORAGE_KEY = "selected_character_id"



