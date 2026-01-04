export async function POST(request: Request) {
  try {
    const { text } = await request.json()

    console.log("[v0] TTS API: Received request for text:", text?.substring(0, 50))

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

    const cleanedText = text.replace(/\n+/g, "，").replace(/\s+/g, " ").trim()
    console.log("[v0] TTS API: Cleaned text:", cleanedText.substring(0, 50))

    const response = await fetch("https://api.siliconflow.cn/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "fnlp/MOSS-TTSD-v0.5",
        input: cleanedText,
        voice: "fnlp/MOSS-TTSD-v0.5:benjamin",
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
