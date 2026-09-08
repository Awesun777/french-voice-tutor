// Fixed, short samples only. Successful samples are cached; concurrent requests share work.
const samples = new Map<string, Promise<{ base64: string; mimeType: string }>>();
const TEXT = "Bonjour ! De quoi aimerais-tu parler aujourd’hui ? Prenons le temps de pratiquer ensemble.";
export async function tutorVoicePreview(agent: "romain" | "anna") {
  const cached = samples.get(agent);
  if (cached) return cached;
  const pending = (async () => {
    let response: Response;
    if (agent === "romain") {
      if (!process.env.OPENAI_API_KEY) throw new Error("Voice preview unavailable");
      response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "cedar", input: TEXT, response_format: "mp3", instructions: "Speak in natural French, clearly and warmly." }),
      });
    } else {
      const key = process.env.ELEVENLABS_API_KEY;
      const id = process.env.ELEVENLABS_ANNA_AGENT_ID;
      if (!key || !id) throw new Error("Voice preview unavailable");
      const configResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(id)}`, { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(10000) });
      if (!configResponse.ok) throw new Error("Voice preview unavailable");
      const config = await configResponse.json();
      const voiceId = config.conversation_config?.tts?.voice_id;
      if (typeof voiceId !== "string" || !voiceId) throw new Error("Voice preview unavailable");
      response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_64`, {
        method: "POST", signal: AbortSignal.timeout(20000), headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({text: TEXT, model_id: "eleven_flash_v2_5", language_code: "fr"}),
      });
    }
    if (!response.ok) throw new Error("Voice preview unavailable");
    return { base64: Buffer.from(await response.arrayBuffer()).toString("base64"), mimeType: "audio/mpeg" };
  })();
  samples.set(agent, pending);
  try { return await pending; } catch (error) { samples.delete(agent); throw error; }
}
