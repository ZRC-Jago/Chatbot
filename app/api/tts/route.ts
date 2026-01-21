export const runtime = "nodejs"

import dns from "node:dns"
import { getCharacterById, getDefaultCharacter, CHARACTER_STORAGE_KEY, convertAgentToCharacter } from "@/lib/characters"
import { TTS_MODEL } from "@/lib/models"
import { createClient } from "@/lib/supabase/server"

// 在 Windows / 某些网络环境下，Node 可能优先解析 IPv6 导致 fetch failed；强制 IPv4 优先
try {
  dns.setDefaultResultOrder("ipv4first")
} catch {
  // ignore
}

export async function POST(request: Request) {
  try {
    const { text, characterId, userId } = await request.json()

    console.log("[v0] TTS API: Received request for text:", text?.substring(0, 50))
    console.log("[v0] TTS API: Character ID:", characterId)
    console.log("[v0] TTS API: User ID:", userId)

    if (!text) {
      return new Response("Text is required", { status: 400 })
    }

    if (!process.env.SILICONFLOW_API_KEY) {
      return new Response(
        JSON.stringify({
          error: "SILICONFLOW_API_KEY environment variable is not configured. Please add it in the Vars section.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    // 获取角色配置
    let character = characterId ? getCharacterById(characterId) : null
    
    // 如果不是系统角色，尝试从数据库加载自定义智能体
    if (!character && characterId && userId) {
      try {
        const supabase = await createClient()
        const { data: agent, error } = await supabase
          .from("custom_agents")
          .select("*")
          .eq("id", characterId)
          .single()
        
        if (!error && agent) {
          character = convertAgentToCharacter(agent)
          console.log("[v0] TTS API: 加载自定义智能体:", character.name)
        }
      } catch (error) {
        console.error("[v0] TTS API: 加载自定义智能体失败:", error)
      }
    }
    
    // 如果还是找不到，使用默认角色
    if (!character) {
      character = getDefaultCharacter()
    }
    
    console.log("[v0] TTS API: Using character:", character.name, "voice:", character.voice)

    const cleanedText = text.replace(/\n+/g, "，").replace(/\s+/g, " ").trim()
    console.log("[v0] TTS API: Cleaned text:", cleanedText.substring(0, 50))

    const response = await fetch("https://api.siliconflow.cn/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: cleanedText,
        voice: character.voice,
        response_format: "mp3",
        sample_rate: 32000,
        speed: 1,
        gain: 0,
      }),
    })

    console.log("[v0] TTS API: SiliconFlow response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] TTS API: SiliconFlow error:", errorText)
      throw new Error(`TTS API error: ${response.status} - ${errorText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    console.log("[v0] TTS API: Audio buffer size:", audioBuffer.byteLength)

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    })
  } catch (error) {
    console.error("[v0] TTS API: Error:", error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Failed to generate speech" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    )
  }
}
