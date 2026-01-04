import { SYSTEM_PROMPT } from "@/lib/system-prompt"

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || "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"

export async function POST(req: Request) {
  const { messages } = await req.json()

  console.log("[v0] Received messages:", messages)

  // Prepare messages with system prompt
  const formattedMessages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    ...messages,
  ]

  try {
    // Call OpenRouter API with streaming
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: "xiaomi/mimo-v2-flash:free",
        messages: formattedMessages,
        stream: true,
        reasoning: {
          enabled: true,
        },
      }),
    })

    console.log("[v0] OpenRouter API response status:", response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] OpenRouter API error:", errorText)
      throw new Error(`OpenRouter API error: ${response.status}`)
    }

    // Create a TransformStream to convert OpenRouter SSE format to our custom format
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader()
        if (!reader) {
          console.error("[v0] No reader available")
          controller.close()
          return
        }

        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()

            if (done) {
              console.log("[v0] Stream completed")
              controller.close()
              break
            }

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

                  console.log("[v0] Parsed SSE data:", data)

                  // Extract content delta from OpenRouter response
                  const delta = data.choices?.[0]?.delta?.content

                  if (delta) {
                    console.log("[v0] Sending delta:", delta)
                    // Send each character separately for smooth streaming effect
                    controller.enqueue(encoder.encode(delta))
                  }
                } catch (e) {
                  console.error("[v0] Error parsing SSE data:", e, "Line:", trimmedLine)
                }
              }
            }
          }
        } catch (error) {
          console.error("[v0] Stream reading error:", error)
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
    console.error("[v0] OpenRouter API error:", error)
    return new Response(JSON.stringify({ error: "Failed to fetch response from AI" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
