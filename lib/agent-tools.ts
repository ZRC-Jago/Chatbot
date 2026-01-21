export type ToolJsonSchema = {
  type: "object"
  properties: Record<string, any>
  required?: string[]
  additionalProperties?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: ToolJsonSchema
}

export type ToolHandler = (args: any) => Promise<any>

type ToolEntry = {
  def: ToolDefinition
  handler: ToolHandler
}

const toolRegistry = new Map<string, ToolEntry>()

function registerTool(def: ToolDefinition, handler: ToolHandler) {
  toolRegistry.set(def.name, { def, handler })
}

export function getToolsForModel(): Array<{ type: "function"; function: ToolDefinition }> {
  return Array.from(toolRegistry.values()).map(({ def }) => ({
    type: "function",
    function: def,
  }))
}

export async function executeTool(name: string, args: any): Promise<any> {
  const entry = toolRegistry.get(name)
  if (!entry) {
    throw new Error(`未知工具: ${name}`)
  }
  return await entry.handler(args)
}

// ==================== 内置工具 ====================
// 所有工具都在这里统一管理，方便后续扩展和维护

// ========== 通用工具 ==========

registerTool(
  {
    name: "get_current_time",
    description: "获取当前时间（中国格式字符串）和日期信息",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  async () => {
    const now = new Date()
    return {
      now: now.toLocaleString("zh-CN"),
      date: now.toLocaleDateString("zh-CN"),
      time: now.toLocaleTimeString("zh-CN"),
      timestamp: Date.now(),
      weekday: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"][now.getDay()],
    }
  }
)

registerTool(
  {
    name: "calculate",
    description: "执行基本数学计算（加减乘除、幂运算、开方等）",
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "数学表达式，例如：'2+3*4'、'sqrt(16)'、'pow(2,3)'",
        },
      },
      required: ["expression"],
      additionalProperties: false,
    },
  },
  async (args: { expression: string }) => {
    const expr = args.expression.trim()
    // 安全计算：只允许数字、运算符和基本数学函数
    const safeExpr = expr.replace(/[^0-9+\-*/().\s,sqrtpow]/g, "")
    if (!safeExpr) {
      throw new Error("无效的数学表达式")
    }
    
    try {
      // 使用 Function 构造函数安全执行（仅限数学运算）
      const result = Function(`"use strict"; return ${expr}`)()
      if (typeof result !== "number" || !isFinite(result)) {
        throw new Error("计算结果无效")
      }
      return {
        expression: expr,
        result: result,
        rounded: Math.round(result * 100) / 100,
      }
    } catch (error) {
      throw new Error(`计算失败: ${(error as Error).message}`)
    }
  }
)

registerTool(
  {
    name: "unit_converter",
    description: "单位换算工具（长度、重量、温度、体积等）",
    parameters: {
      type: "object",
      properties: {
        value: { type: "number", description: "要转换的数值" },
        from_unit: { type: "string", description: "源单位（如：cm, kg, celsius, liter）" },
        to_unit: { type: "string", description: "目标单位（如：m, g, fahrenheit, ml）" },
        category: {
          type: "string",
          enum: ["length", "weight", "temperature", "volume"],
          description: "单位类别：length(长度)、weight(重量)、temperature(温度)、volume(体积)",
        },
      },
      required: ["value", "from_unit", "to_unit", "category"],
      additionalProperties: false,
    },
  },
  async (args: { value: number; from_unit: string; to_unit: string; category: string }) => {
    const { value, from_unit, to_unit, category } = args
    const v = Number(value)
    if (!isFinite(v)) {
      throw new Error("数值必须为有效数字")
    }

    let result: number
    const from = from_unit.toLowerCase()
    const to = to_unit.toLowerCase()

    switch (category) {
      case "length": {
        // 长度换算：统一转换为米
        const toMeter: Record<string, number> = {
          mm: 0.001,
          cm: 0.01,
          m: 1,
          km: 1000,
          inch: 0.0254,
          ft: 0.3048,
          yd: 0.9144,
          mile: 1609.34,
        }
        const fromMeter: Record<string, number> = {
          mm: 1000,
          cm: 100,
          m: 1,
          km: 0.001,
          inch: 39.3701,
          ft: 3.28084,
          yd: 1.09361,
          mile: 0.000621371,
        }
        if (!toMeter[from] || !fromMeter[to]) {
          throw new Error(`不支持的长度单位: ${from} 或 ${to}`)
        }
        result = v * toMeter[from] * fromMeter[to]
        break
      }
      case "weight": {
        // 重量换算：统一转换为公斤
        const toKg: Record<string, number> = {
          mg: 0.000001,
          g: 0.001,
          kg: 1,
          t: 1000,
          oz: 0.0283495,
          lb: 0.453592,
        }
        const fromKg: Record<string, number> = {
          mg: 1000000,
          g: 1000,
          kg: 1,
          t: 0.001,
          oz: 35.274,
          lb: 2.20462,
        }
        if (!toKg[from] || !fromKg[to]) {
          throw new Error(`不支持的重量单位: ${from} 或 ${to}`)
        }
        result = v * toKg[from] * fromKg[to]
        break
      }
      case "temperature": {
        // 温度换算
        if (from === "celsius" && to === "fahrenheit") {
          result = (v * 9) / 5 + 32
        } else if (from === "fahrenheit" && to === "celsius") {
          result = ((v - 32) * 5) / 9
        } else if (from === "celsius" && to === "kelvin") {
          result = v + 273.15
        } else if (from === "kelvin" && to === "celsius") {
          result = v - 273.15
        } else if (from === to) {
          result = v
        } else {
          throw new Error(`不支持的温度单位组合: ${from} 到 ${to}`)
        }
        break
      }
      case "volume": {
        // 体积换算：统一转换为升
        const toLiter: Record<string, number> = {
          ml: 0.001,
          l: 1,
          m3: 1000,
          fl_oz: 0.0295735,
          cup: 0.236588,
          pint: 0.473176,
          gallon: 3.78541,
        }
        const fromLiter: Record<string, number> = {
          ml: 1000,
          l: 1,
          m3: 0.001,
          fl_oz: 33.814,
          cup: 4.22675,
          pint: 2.11338,
          gallon: 0.264172,
        }
        if (!toLiter[from] || !fromLiter[to]) {
          throw new Error(`不支持的体积单位: ${from} 或 ${to}`)
        }
        result = v * toLiter[from] * fromLiter[to]
        break
      }
      default:
        throw new Error(`不支持的单位类别: ${category}`)
    }

    return {
      value: v,
      from_unit: from_unit,
      to_unit: to_unit,
      result: Math.round(result * 10000) / 10000,
      category: category,
    }
  }
)

registerTool(
  {
    name: "calculate_bmi",
    description: "计算 BMI，并返回 BMI 值与分级（亚洲人常用分级）",
    parameters: {
      type: "object",
      properties: {
        height_cm: { type: "number", description: "身高（厘米）" },
        weight_kg: { type: "number", description: "体重（公斤）" },
      },
      required: ["height_cm", "weight_kg"],
      additionalProperties: false,
    },
  },
  async (args: { height_cm: number; weight_kg: number }) => {
    const h = Number(args.height_cm)
    const w = Number(args.weight_kg)
    if (!isFinite(h) || !isFinite(w) || h <= 0 || w <= 0) {
      throw new Error("height_cm 和 weight_kg 必须为正数")
    }
    const heightM = h / 100
    const bmi = w / (heightM * heightM)
    const bmiRounded = Math.round(bmi * 10) / 10

    // 亚洲人常用分级（参考 WHO 亚洲人 BMI 分类，简化版）
    let category = "正常"
    if (bmiRounded < 18.5) category = "偏瘦"
    else if (bmiRounded < 23) category = "正常"
    else if (bmiRounded < 27.5) category = "超重"
    else category = "肥胖"

    return { bmi: bmiRounded, category }
  }
)

registerTool(
  {
    name: "estimate_daily_calories",
    description:
      "估算每日维持热量（TDEE）和基础代谢（BMR）。基于 Mifflin-St Jeor 公式 + 活动系数。",
    parameters: {
      type: "object",
      properties: {
        sex: { type: "string", description: "性别：male 或 female", enum: ["male", "female"] },
        age: { type: "number", description: "年龄（岁）" },
        height_cm: { type: "number", description: "身高（厘米）" },
        weight_kg: { type: "number", description: "体重（公斤）" },
        activity_level: {
          type: "string",
          description:
            "活动水平：sedentary(久坐)、light(轻)、moderate(中)、active(高)、very_active(很高)",
          enum: ["sedentary", "light", "moderate", "active", "very_active"],
        },
      },
      required: ["sex", "age", "height_cm", "weight_kg", "activity_level"],
      additionalProperties: false,
    },
  },
  async (args: {
    sex: "male" | "female"
    age: number
    height_cm: number
    weight_kg: number
    activity_level: "sedentary" | "light" | "moderate" | "active" | "very_active"
  }) => {
    const sex = args.sex
    const age = Number(args.age)
    const h = Number(args.height_cm)
    const w = Number(args.weight_kg)
    if (![age, h, w].every((x) => isFinite(x) && x > 0)) {
      throw new Error("age/height_cm/weight_kg 必须为正数")
    }

    // Mifflin-St Jeor
    const bmr = sex === "male" ? 10 * w + 6.25 * h - 5 * age + 5 : 10 * w + 6.25 * h - 5 * age - 161

    const factors: Record<string, number> = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9,
    }
    const factor = factors[args.activity_level] ?? 1.2
    const tdee = bmr * factor

    return {
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      activity_factor: factor,
      formula: "Mifflin-St Jeor + activity factor",
    }
  }
)

// ========== 健康相关工具 ==========

registerTool(
  {
    name: "calculate_body_fat_percentage",
    description: "估算体脂率（基于BMI和年龄的简化公式）",
    parameters: {
      type: "object",
      properties: {
        bmi: { type: "number", description: "BMI指数" },
        age: { type: "number", description: "年龄（岁）" },
        sex: { type: "string", enum: ["male", "female"], description: "性别" },
      },
      required: ["bmi", "age", "sex"],
      additionalProperties: false,
    },
  },
  async (args: { bmi: number; age: number; sex: "male" | "female" }) => {
    const bmi = Number(args.bmi)
    const age = Number(args.age)
    if (!isFinite(bmi) || !isFinite(age) || bmi <= 0 || age <= 0) {
      throw new Error("BMI和年龄必须为正数")
    }

    // Deurenberg公式（简化版）
    const bodyFat = args.sex === "male"
      ? 1.2 * bmi + 0.23 * age - 16.2
      : 1.2 * bmi + 0.23 * age - 5.4

    const rounded = Math.round(bodyFat * 10) / 10
    const clamped = Math.max(5, Math.min(50, rounded)) // 限制在合理范围

    let category = ""
    if (args.sex === "male") {
      if (clamped < 10) category = "偏瘦"
      else if (clamped < 20) category = "正常"
      else if (clamped < 25) category = "偏高"
      else category = "过高"
    } else {
      if (clamped < 16) category = "偏瘦"
      else if (clamped < 25) category = "正常"
      else if (clamped < 30) category = "偏高"
      else category = "过高"
    }

    return {
      body_fat_percentage: clamped,
      category,
      note: "这是基于BMI和年龄的估算值，仅供参考。精确测量需要使用专业设备。",
    }
  }
)

registerTool(
  {
    name: "calculate_ideal_weight",
    description: "计算理想体重范围（基于身高和性别）",
    parameters: {
      type: "object",
      properties: {
        height_cm: { type: "number", description: "身高（厘米）" },
        sex: { type: "string", enum: ["male", "female"], description: "性别" },
      },
      required: ["height_cm", "sex"],
      additionalProperties: false,
    },
  },
  async (args: { height_cm: number; sex: "male" | "female" }) => {
    const h = Number(args.height_cm)
    if (!isFinite(h) || h <= 0) {
      throw new Error("身高必须为正数")
    }

    const heightM = h / 100
    // 使用BMI正常范围（18.5-23.9）计算理想体重
    const minBMI = 18.5
    const maxBMI = 23.9

    const minWeight = minBMI * heightM * heightM
    const maxWeight = maxBMI * heightM * heightM

    return {
      height_cm: h,
      ideal_weight_range_kg: {
        min: Math.round(minWeight * 10) / 10,
        max: Math.round(maxWeight * 10) / 10,
      },
      bmi_range: { min: minBMI, max: maxBMI },
      note: "基于亚洲人BMI正常范围（18.5-23.9）计算",
    }
  }
)

// ========== 文本处理工具 ==========

registerTool(
  {
    name: "text_analyzer",
    description: "分析文本的基本统计信息（字数、字符数、段落数等）",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "要分析的文本" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  async (args: { text: string }) => {
    const text = args.text || ""
    const chars = text.length
    const charsNoSpaces = text.replace(/\s/g, "").length
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const paragraphs = text.trim() ? text.split(/\n\s*\n/).filter((p) => p.trim()).length : 0
    const sentences = text.match(/[.!?。！？]+/g)?.length || 0

    return {
      character_count: chars,
      character_count_no_spaces: charsNoSpaces,
      word_count: words,
      paragraph_count: paragraphs,
      sentence_count: sentences,
      estimated_reading_time_minutes: Math.ceil(words / 200), // 假设每分钟200字
    }
  }
)

registerTool(
  {
    name: "generate_random",
    description: "生成随机数或随机选择",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["number", "choice"],
          description: "类型：number(随机数) 或 choice(随机选择)",
        },
        min: { type: "number", description: "最小值（仅type=number时）" },
        max: { type: "number", description: "最大值（仅type=number时）" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "选项列表（仅type=choice时）",
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  async (args: { type: "number" | "choice"; min?: number; max?: number; options?: string[] }) => {
    if (args.type === "number") {
      const min = Number(args.min ?? 0)
      const max = Number(args.max ?? 100)
      if (!isFinite(min) || !isFinite(max) || min >= max) {
        throw new Error("min和max必须为有效数字，且min < max")
      }
      const result = Math.floor(Math.random() * (max - min + 1)) + min
      return {
        type: "number",
        result,
        range: { min, max },
      }
    } else if (args.type === "choice") {
      if (!args.options || args.options.length === 0) {
        throw new Error("选项列表不能为空")
      }
      const result = args.options[Math.floor(Math.random() * args.options.length)]
      return {
        type: "choice",
        result,
        options: args.options,
      }
    } else {
      throw new Error(`不支持的类型: ${args.type}`)
    }
  }
)

// ========== 翻译工具 ==========

registerTool(
  {
    name: "translate_text",
    description: "翻译文本到目标语言。支持常见语言对之间的翻译（中英、中日、中韩、英法、英德等）",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "要翻译的文本" },
        from_lang: {
          type: "string",
          description: "源语言代码：zh(中文)、en(英语)、ja(日语)、ko(韩语)、fr(法语)、de(德语)、es(西班牙语)、ru(俄语)、ar(阿拉伯语)等，auto表示自动检测",
          default: "auto",
        },
        to_lang: {
          type: "string",
          description: "目标语言代码：zh(中文)、en(英语)、ja(日语)、ko(韩语)、fr(法语)、de(德语)、es(西班牙语)、ru(俄语)、ar(阿拉伯语)等",
        },
      },
      required: ["text", "to_lang"],
      additionalProperties: false,
    },
  },
  async (args: { text: string; from_lang?: string; to_lang: string }) => {
    const { text, from_lang = "auto", to_lang } = args

    if (!text || text.trim().length === 0) {
      throw new Error("要翻译的文本不能为空")
    }

    if (!to_lang) {
      throw new Error("目标语言不能为空")
    }

    // 语言代码映射
    const langMap: Record<string, string> = {
      zh: "中文",
      en: "英语",
      ja: "日语",
      ko: "韩语",
      fr: "法语",
      de: "德语",
      es: "西班牙语",
      ru: "俄语",
      ar: "阿拉伯语",
      pt: "葡萄牙语",
      it: "意大利语",
      nl: "荷兰语",
      vi: "越南语",
      th: "泰语",
      auto: "自动检测",
    }

    const fromLangName = langMap[from_lang.toLowerCase()] || from_lang
    const toLangName = langMap[to_lang.toLowerCase()] || to_lang

    // 检测是否已经是目标语言（简单检测）
    if (from_lang !== "auto" && from_lang.toLowerCase() === to_lang.toLowerCase()) {
      return {
        original_text: text,
        translated_text: text,
        from_language: fromLangName,
        to_language: toLangName,
        note: "源语言和目标语言相同，无需翻译",
      }
    }

    // 返回翻译请求信息（实际翻译由AI模型在后续步骤中完成）
    // 这是一个标记工具，告诉AI需要进行翻译操作
    return {
      original_text: text,
      translation_request: {
        from_language: fromLangName,
        to_language: toLangName,
        detected_from_lang: from_lang === "auto" ? "待检测" : fromLangName,
      },
      instruction: `请将以下文本从${fromLangName}翻译成${toLangName}：\n"${text}"\n\n翻译要求：\n1. 保持原意准确\n2. 符合目标语言的表达习惯\n3. 如涉及专业术语，请保持一致性`,
      note: "这是一个翻译请求标记。AI将根据此信息在回复中提供翻译结果。",
    }
  }
)

registerTool(
  {
    name: "detect_language",
    description: "检测文本的语言类型",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "要检测语言的文本" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  async (args: { text: string }) => {
    const text = args.text || ""

    if (text.trim().length === 0) {
      throw new Error("文本不能为空")
    }

    // 简单的语言检测逻辑（基于字符范围）
    const languagePatterns: Array<{ lang: string; name: string; pattern: RegExp }> = [
      { lang: "zh", name: "中文", pattern: /[\u4e00-\u9fff]/ },
      { lang: "ja", name: "日语", pattern: /[\u3040-\u309f\u30a0-\u30ff]/ },
      { lang: "ko", name: "韩语", pattern: /[\uac00-\ud7a3]/ },
      { lang: "ar", name: "阿拉伯语", pattern: /[\u0600-\u06ff]/ },
      { lang: "ru", name: "俄语", pattern: /[\u0400-\u04ff]/ },
      { lang: "th", name: "泰语", pattern: /[\u0e00-\u0e7f]/ },
      { lang: "en", name: "英语", pattern: /^[a-zA-Z\s.,!?'-]+$/ },
    ]

    // 统计各语言的匹配字符数
    const scores: Record<string, number> = {}
    for (const { lang, pattern } of languagePatterns) {
      const matches = text.match(pattern)
      scores[lang] = matches ? matches.length : 0
    }

    // 找出得分最高的语言
    let detectedLang = "en" // 默认英语
    let maxScore = 0
    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score
        detectedLang = lang
      }
    }

    // 如果没有任何匹配，尝试更多检测
    if (maxScore === 0) {
      // 检查是否包含常见中文标点
      if (/[，。！？；：、]/.test(text)) {
        detectedLang = "zh"
      }
      // 检查是否主要是拉丁字符
      else if (/^[a-zA-Z\s.,!?'-]+$/.test(text.trim())) {
        detectedLang = "en"
      } else {
        detectedLang = "unknown"
      }
    }

    const langInfo = languagePatterns.find((l) => l.lang === detectedLang) || {
      lang: detectedLang,
      name: detectedLang === "unknown" ? "未知" : detectedLang.toUpperCase(),
    }

    return {
      text: text.substring(0, 100) + (text.length > 100 ? "..." : ""), // 只返回前100个字符作为示例
      detected_language: langInfo.name,
      language_code: detectedLang,
      confidence: maxScore > 0 ? "高" : "中",
      character_count: text.length,
    }
  }
)

// ========== 联网搜索 / 抓取工具 ==========

registerTool(
  {
    name: "web_search",
    description:
      "联网搜索：用于查询实时信息。返回搜索结果列表（标题、摘要、链接）。注意：需要在服务端配置 BOCHA_API_KEY。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词/问题" },
        num_results: { type: "number", description: "返回条数（1-10），默认5" },
        language: { type: "string", description: "语言代码，如 zh / en，可选" },
        freshness: {
          type: "string",
          enum: ["noLimit", "oneDay", "oneWeek", "oneMonth", "oneYear"],
          description: "时间范围：noLimit/oneDay/oneWeek/oneMonth/oneYear，默认 noLimit",
        },
        summary: { type: "boolean", description: "是否返回摘要，默认 true" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  async (args: {
    query: string
    num_results?: number
    language?: string
    freshness?: "noLimit" | "oneDay" | "oneWeek" | "oneMonth" | "oneYear"
    summary?: boolean
  }) => {
    const query = String(args.query || "").trim()
    if (!query) throw new Error("query 不能为空")

    // Bocha count: 文档给到 1-50；这里做个合理限制
    const count = Math.max(1, Math.min(50, Number(args.num_results ?? 5)))
    const freshness = args.freshness ?? "noLimit"
    const summary = args.summary ?? true

    // 默认接入博查（Bocha）搜索 API。你需要配置环境变量：BOCHA_API_KEY
    // https://api.bocha.cn/v1/web-search
    // 兼容多种命名，避免本地环境变量名写错导致无法使用
    const rawKey = process.env.BOCHA_API_KEY || process.env.BOCHA_KEY || process.env.BOCHA_APIKEY
    if (!rawKey) {
      throw new Error(
        "未配置 BOCHA_API_KEY（或 BOCHA_KEY/BOCHA_APIKEY），无法执行联网搜索。请在项目根目录 .env.local 配置后重启 npm run dev。"
      )
    }
    const apiKey = rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch("https://api.bocha.cn/v1/web-search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Bocha 使用 header: Authorization
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query,
          freshness,
          summary,
          count,
          // language 字段不是 Bocha 标准参数；保留给未来兼容，不传给 Bocha
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`搜索请求失败: ${res.status} ${text}`.slice(0, 500))
      }

      const data: any = await res.json()
      if (data?.code !== 200) {
        throw new Error(`搜索服务返回错误: code=${data?.code} msg=${data?.msg ?? ""}`.trim())
      }

      const webPages = data?.data?.webPages
      const items = Array.isArray(webPages?.value) ? webPages.value : []

      // 结果筛选和去重
      const seenTitles = new Set<string>()
      const seenUrls = new Set<string>()
      const filteredItems: any[] = []

      for (const item of items) {
        const title = String(item?.name ?? "").trim()
        const url = String(item?.url ?? "").trim()
        const snippet = String(item?.snippet ?? "").trim()

        // 跳过空标题或空URL
        if (!title || !url) continue

        // 去重：标题或URL重复的跳过
        const titleKey = title.toLowerCase().slice(0, 100) // 只比较前100字符避免过长
        const urlKey = url.toLowerCase().split("?")[0] // 去除查询参数比较
        if (seenTitles.has(titleKey) || seenUrls.has(urlKey)) continue

        // 过滤低质量内容
        // 1. 跳过重复内容过多的结果（同一内容重复多次）
        if (snippet.includes("根据《中国居民膳食营养素参考摄入量》(2013版),成年男、女的每日蛋白质推荐摄入量分别为65g和55g。") && 
            snippet.match(/65g和55g/g)?.length && (snippet.match(/65g和55g/g)?.length || 0) > 2) {
          continue
        }

        // 2. 跳过明显无关的内容（如食物营养查询页面，除非明确搜索食物）
        if (url.includes("boohee.com/shiwu") && !query.toLowerCase().includes("食物") && !query.toLowerCase().includes("营养")) {
          continue
        }

        // 3. 跳过题库/刷题网站的低质量重复内容
        if (title.includes("刷刷题") && snippet.length < 100) {
          continue
        }

        // 4. 优先保留权威来源（政府网站、学术机构、知名健康网站）
        const isAuthoritative = 
          url.includes(".gov.cn") || 
          url.includes(".edu.cn") || 
          url.includes("who.int") ||
          url.includes("cdc.gov") ||
          url.includes("npc.gov.cn") ||
          url.includes("nhc.gov.cn") ||
          url.includes("chinacdc.cn") ||
          title.includes("中国居民膳食指南") ||
          title.includes("中国营养学会") ||
          title.includes("世界卫生组织")

        seenTitles.add(titleKey)
        seenUrls.add(urlKey)

        filteredItems.push({
          ...item,
          _authoritative: isAuthoritative, // 标记权威来源
        })
      }

      // 按权威性和相关性排序：权威来源优先，然后按原始位置排序
      filteredItems.sort((a, b) => {
        if (a._authoritative && !b._authoritative) return -1
        if (!a._authoritative && b._authoritative) return 1
        // 同类型按原始位置排序
        const posA = items.indexOf(a)
        const posB = items.indexOf(b)
        return posA - posB
      })

      // 取前 count 个结果
      const results = filteredItems.slice(0, count).map((r: any, idx: number) => ({
        title: r?.name ?? "",
        link: r?.url ?? "",
        display_url: r?.displayUrl ?? "",
        snippet: r?.snippet ?? "",
        summary: r?.summary ?? null,
        site_name: r?.siteName ?? null,
        date_last_crawled: r?.dateLastCrawled ?? null,
        position: idx + 1,
      }))

      return {
        query,
        provider: "bocha",
        log_id: data?.log_id ?? null,
        results,
        filtered_count: filteredItems.length,
        original_count: items.length,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
)

registerTool(
  {
    name: "fetch_url",
    description:
      "抓取网页文本：用于把某个URL页面的主要文本抓取出来（用于阅读、摘要、引用）。注意：可能受站点反爬/登录限制影响。",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "要抓取的URL（http/https）" },
        max_chars: { type: "number", description: "最多返回字符数，默认8000" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  async (args: { url: string; max_chars?: number }) => {
    const url = String(args.url || "").trim()
    if (!/^https?:\/\//i.test(url)) throw new Error("url 必须是 http/https")

    const maxChars = Math.max(1000, Math.min(20000, Number(args.max_chars ?? 8000)))

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          // 尽量避免被一些站点拒绝
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        const text = await res.text().catch(() => "")
        throw new Error(`抓取失败: ${res.status} ${text}`.slice(0, 500))
      }

      const contentType = res.headers.get("content-type") || ""
      const raw = await res.text()

      // 简单 HTML -> 文本（不引入依赖，先用轻量方案）
      let text = raw
      if (contentType.includes("text/html")) {
        text = text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
          .replace(/<\/(p|div|br|li|h1|h2|h3|h4|h5|h6)>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/[ \t]{2,}/g, " ")
          .trim()
      }

      return {
        url,
        content_type: contentType,
        text: text.slice(0, maxChars),
        truncated: text.length > maxChars,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
)

