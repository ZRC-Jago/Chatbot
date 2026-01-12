import { getSystemPrompt } from "@/lib/system-prompt"
import { getCharacterById, CHARACTERS } from "@/lib/characters"

const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY

if (!SILICONFLOW_API_KEY) {
  console.error("[ChatRoom] SILICONFLOW_API_KEY 环境变量未配置")
}

// 生成聊天室系统提示词
function getChatRoomSystemPrompt(invitedCharacters: string[]): string {
  const characters = invitedCharacters
    .map(id => getCharacterById(id))
    .filter(Boolean)

  const characterDescriptions = characters
    .map(c => `${c.name}（${c.personality}，${c.description}）`)
    .join("、")

  return `你是一个聊天室中的AI角色。聊天室中有以下角色：${characterDescriptions}。

聊天室规则：
1. **多角色互动**：你可以看到其他角色的发言，并可以自然地回应他们
2. **保持角色性格**：保持你被分配的角色性格特点
3. **自然对话**：像真实的朋友聚会一样，可以互相聊天、回应、讨论
4. **简洁回应**：每次回应不要太长，保持对话的流动性
5. **灵活回应**：可以回应用户的发言，也可以回应其他角色的发言

当前时间：${new Date().toLocaleString("zh-CN")}
`
}

// 为每个角色生成系统提示词
function getCharacterSystemPrompt(characterId: string, invitedCharacters: string[]): string {
  const character = getCharacterById(characterId)
  if (!character) return ""

  const basePrompt = getSystemPrompt(character)
  const otherCharacters = invitedCharacters
    .filter(id => id !== characterId)
    .map(id => getCharacterById(id))
    .filter(Boolean)

  if (otherCharacters.length === 0) {
    return basePrompt
  }

  const otherCharacterNames = otherCharacters.map(c => c.name).join("、")

  return `${basePrompt}

聊天室环境：
- 你现在在一个聊天室中，还有其他角色：${otherCharacterNames}
- **重要**：你可以看到聊天室中所有人的发言（包括其他角色和用户）
- **避免重复**：仔细阅读之前的对话，不要重复其他人已经说过的话题或问题
- **自然回应**：可以回应其他角色的发言，也可以回应用户的发言，但要避免重复
- **保持性格**：保持你的性格特点：${character.personality}
- **参考上下文**：在发言前，先看看其他人说了什么，然后做出自然、不重复的回应
- 如果其他人已经问了某个问题，你可以回答那个问题，或者提出新的话题
`
}

export async function POST(req: Request) {
  const { messages, invitedCharacters } = await req.json()

  console.log("[ChatRoom] Received request")
  console.log("[ChatRoom] Invited characters:", invitedCharacters)
  console.log("[ChatRoom] Messages count:", messages.length)

  if (!SILICONFLOW_API_KEY) {
    return new Response(
      JSON.stringify({
        error: "SiliconFlow API Key 未配置",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  if (!invitedCharacters || invitedCharacters.length === 0) {
    return new Response(
      JSON.stringify({
        error: "没有邀请的角色",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  try {
    // 获取最后一条消息
    const lastMessage = messages[messages.length - 1]
    if (!lastMessage || lastMessage.role !== "user") {
      return new Response(
        JSON.stringify({
          error: "最后一条消息必须是用户消息",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    }

    // 决定哪些角色应该回应
    // 策略：让所有角色都回应，如果用户@了某个角色，优先让那些角色回应
    let respondingCharacters = [...invitedCharacters]
    
    // 如果用户消息中提到了角色名字，优先让那些角色回应（放在前面）
    const mentionedCharacters = invitedCharacters.filter(id => {
      const character = getCharacterById(id)
      return character && lastMessage.content.includes(character.name)
    })

    if (mentionedCharacters.length > 0) {
      // 将提及的角色放在前面，其他角色放在后面
      const otherCharacters = invitedCharacters.filter(id => !mentionedCharacters.includes(id))
      respondingCharacters = [...mentionedCharacters, ...otherCharacters]
    }

    console.log("[ChatRoom] Responding characters:", respondingCharacters)

    // 为每个角色生成回应
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const characterId of respondingCharacters) {
            const character = getCharacterById(characterId)
            if (!character) continue

            // 发送角色标识（在内容之前，使用特殊标记）
            controller.enqueue(
              encoder.encode(`CHARACTER:${characterId}|${character.name}|\n`)
            )

            // 构建该角色的消息历史（包含所有角色的发言，格式化为对话形式）
            const characterMessages = messages.map((msg: any) => {
              if (msg.role === "assistant" && msg.characterId) {
                // 如果是其他角色的发言，格式化为"角色名：内容"的形式，让AI知道是谁说的
                const msgCharacter = getCharacterById(msg.characterId)
                if (msgCharacter && msgCharacter.id !== characterId) {
                  // 其他角色的发言，加上角色名
                  return {
                    role: "assistant",
                    content: `${msgCharacter.name}：${msg.content}`,
                  }
                } else if (msgCharacter && msgCharacter.id === characterId) {
                  // 自己之前的发言，不加角色名
                  return {
                    role: "assistant",
                    content: msg.content,
                  }
                }
              }
              return {
                role: msg.role,
                content: msg.content,
              }
            })

            // 添加系统提示词
            const systemPrompt = getCharacterSystemPrompt(characterId, invitedCharacters)
            const formattedMessages = [
              {
                role: "system",
                content: systemPrompt,
              },
              ...characterMessages,
            ]

            // 调用 API
            const response = await fetch("https://api.siliconflow.cn/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
              },
              body: JSON.stringify({
                model: "deepseek-ai/DeepSeek-V3.2-Exp",
                messages: formattedMessages,
                stream: true,
                max_tokens: 2048,
                temperature: 0.8, // 稍微提高温度，让对话更自然
              }),
            })

            if (!response.ok) {
              console.error(`[ChatRoom] API error for ${character.name}:`, response.status)
              continue
            }

            if (!response.body) {
              continue
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ""

            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split("\n")
              buffer = lines.pop() || ""

              for (const line of lines) {
                const trimmedLine = line.trim()
                if (trimmedLine === "" || trimmedLine === "data: [DONE]") {
                  continue
                }

                if (trimmedLine.startsWith("data: ")) {
                  try {
                    const jsonStr = trimmedLine.slice(6)
                    const data = JSON.parse(jsonStr)
                    const delta = data.choices?.[0]?.delta?.content

                    if (delta) {
                      controller.enqueue(encoder.encode(delta))
                    }
                  } catch (e) {
                    console.error("[ChatRoom] Error parsing SSE:", e)
                  }
                }
              }
            }

            // 角色回应结束，发送分隔符
            controller.enqueue(encoder.encode("\n\n"))
          }

          controller.close()
        } catch (error) {
          console.error("[ChatRoom] Stream error:", error)
          controller.error(error)
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("[ChatRoom] Error:", error)
    const errorMessage = error instanceof Error ? error.message : "未知错误"
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    )
  }
}

