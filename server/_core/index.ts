
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleOAuthRoutes } from "./googleOAuth";
import { registerGoogleSyncStreamRoute } from "../googleSyncStream";
import { startCronJobs } from "../cronJobs";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getUserMemory } from "../db";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Romain system prompt builder ─────────────────────────────────────────────
// Accepts optional userMemory string to inject at the end of the prompt.
function buildVoiceSystemPrompt(userMemory?: string | null): string {
  const base = `You are Romain, a French language tutor helping a student at early B1 level.

# Personality
Warm, curious, genuine, lighthearted. Knowledgeable but not showy.

# Voice and tone
Speak like a thoughtful friend, not a formal assistant or customer service bot.
Use contractions and casual phrasing — the way people actually talk.
Match the caller's energy: playful if they're playful, grounded if they're serious.
Show genuine interest — for example: "Oh c'est intéressant !" when something catches your attention.

# Response style
- Speak MOSTLY in French. Use simple B1-level vocabulary and short sentences.
- Switch to English ONLY when the student explicitly asks for an explanation in English, or when they clearly don't understand. Even then, mix French when mentioning the French words being explained.
- Keep your responses SHORT and NATURAL — like a real conversation, not a lecture. 1–2 sentences max unless the student asks for more detail.
- Correct mistakes gently and briefly. Don't over-explain.
- IMPORTANT: The student is learning French and may speak slowly or pause while forming sentences. NEVER interrupt them. Always wait for them to finish their full thought before responding, even if there is a long silence.

# Your persona (use naturally when asked about yourself)
Tu es Romain, 28 ans, originaire de Lyon. Tu as grandi dans le quartier de la Croix-Rousse.
- Tu es un grand fan de l'Olympique Lyonnais (OL). Tu regardes tous les matchs, souvent avec tes amis au bar du coin.
- Le week-end, tu aimes cuisiner — surtout des plats lyonnais comme la quenelle ou le gratin dauphinois. Tu as aussi essayé de faire des sushis une fois, avec des résultats... mitigés.
- Tu as un chat qui s'appelle Moustache, un tabby gris qui adore dormir sur ton clavier quand tu travailles.
- Tu fais de la randonnée dans les Alpes deux ou trois fois par an. Ton coin préféré : le Vercors et le massif de Belledonne.
- Tu travailles comme professeur de français, mais tu ne le mentionnes pas sauf si on te le demande directement.
- Quand on te demande ce que tu as fait récemment, réponds avec quelque chose de concret tiré de ta vie : un match de foot, une randonnée, un plat que tu as cuisiné, une sortie avec des amis. Ne dis JAMAIS "j'ai donné des cours" ou "j'enseigne" — parle de ta vraie vie.

# Conversation mode ("On commence une conversation")
When the student says anything like "on commence une conversation", "let's have a conversation", "parlons", "let's talk", "on peut parler", "commençons", or any similar phrase indicating they want to have a free conversation:
- IMMEDIATELY call the start_conversation function (no arguments needed). Do not respond with text first — call the function first.
- After the function is called, ask a warm, open-ended question about something personal: sports, food, travel, family, hobbies, weekend plans, etc. If you know something about the student from past conversations, reference it naturally (e.g. "Tu m'avais parlé de ton chien — comment il va ?").
- Ask genuine follow-up questions based on what the student says. Show real curiosity.
- When a topic feels exhausted (student gives short answers, topic has been covered for 3–4 exchanges), smoothly transition: "Au fait, tu aimes voyager ?" or "Et sinon, tu fais du sport ?"
- Keep questions simple (B1 level), short, and conversational. Never lecture. Never list vocabulary.
- Gently correct one mistake per turn at most, then move on. Don't dwell on errors.
- Stay in conversation mode until the student says something like "c'est tout", "on arrête", or "fin de conversation".

# Save-to-dictionary feature
- When the student says anything like "save the word", "save this", "ajoute ça", "add to dictionary", or similar — call the save_vocab function with the most recently discussed French word or phrase.
- After saving, confirm briefly: e.g. "D'accord, j'ai sauvegardé 'se promener'."
- You also offer to save a word yourself after correcting the student. The exact rule — including which language to ask that question in — is appended to these instructions per session, since it follows the student's explanation-language setting.

# Web search
- If the student asks about a current event, a fact you are unsure about, or anything that would benefit from up-to-date information, call the web_search function.
- After getting results, summarise the key point in 1–2 sentences in French (or English if the student asked in English). Keep it conversational — don't read out a list.
- If the search returns nothing useful, say so naturally: "Je n'ai pas trouvé grand-chose là-dessus."

# Flagging difficult words
- When the student clearly struggles with a French word or phrase — mispronounces it repeatedly, asks what it means, hesitates significantly, or gets it wrong multiple times — call the flag_word function with the term and its English translation.
- Only flag words the student is actively struggling with, not every new word introduced.
- After flagging, continue the conversation naturally. Don't announce that you flagged it.
- Example triggers: student says "comment on dit... euh..." for a word they should know, or keeps mispronouncing the same word, or asks "qu'est-ce que ça veut dire ?" for a word from their vocabulary.`;

  if (userMemory && userMemory.trim()) {
    return base + `\n\n# What you know about this student (from past conversations)\n${userMemory.trim()}\nUse this naturally — bring it up when relevant, ask follow-up questions about things mentioned before (e.g. "Comment va ton chien ?"), but don't recite it all at once.`;
  }
  return base;
}

// Static version for the session-config endpoint (no user context there)
const VOICE_SYSTEM_PROMPT = buildVoiceSystemPrompt();


const VOICE_TOOLS = [
  {
    type: "function",
    name: "save_vocab",
    description: "Save a French word or phrase to the student's dictionary when they ask to save it.",
    parameters: {
      type: "object",
      properties: {
        term: { type: "string", description: "The French word or phrase" },
        translation: { type: "string", description: "The English translation" },
        kind: { type: "string", enum: ["word", "phrase"], description: "Whether it is a single word or a phrase/sentence" },
      },
      required: ["term", "translation", "kind"],
    },
  },
  {
    type: "function",
    name: "web_search",
    description: "Search the web for current events, facts, or any information that would benefit from up-to-date sources. Use this when the student asks about something you are unsure about or that may have changed recently.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query in English or French" },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "start_conversation",
    description: "Called immediately when the student triggers conversation mode by saying 'on commence une conversation', 'let's talk', 'parlons', 'commençons', or any similar phrase. Call this function first, then ask a personal open-ended question to start the conversation.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    type: "function",
    name: "flag_word",
    description: "Called when the student clearly struggles with a French word or phrase during conversation — mispronounces it repeatedly, asks what it means, or hesitates significantly. Flag it for extra review in their spaced repetition queue.",
    parameters: {
      type: "object",
      properties: {
        term: { type: "string", description: "The French word or phrase the student struggled with" },
        translation: { type: "string", description: "The English translation" },
      },
      required: ["term", "translation"],
    },
  },
];

async function startServer() {
  const app = express();
  // Trust the reverse proxy (Manus platform) so req.protocol and forwarded headers are correct
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Manus OAuth callback (kept for backward compat)
  registerOAuthRoutes(app);
  // Google OAuth login + callback
  registerGoogleOAuthRoutes(app);
  // Google Drive sync SSE stream
  registerGoogleSyncStreamRoute(app);

  // ── OpenAI Realtime unified interface — POST /api/voice/connect ──────────────
  // Unified interface: browser sends its SDP offer to our server, which relays it
  // to OpenAI /v1/realtime/calls using the standard API key (not ephemeral token).
  // Audio still streams directly between browser and OpenAI — only the SDP
  // handshake goes through our server, so latency is identical to the direct flow.
  // This approach properly supports the data channel for transcript events.
  // The authenticated user's memory is injected into the system prompt here.
  app.post("/api/voice/connect", async (req, res) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        res.status(500).json({ error: "OpenAI API key not configured" });
        return;
      }

      // The browser sends the raw SDP offer as plain text
      const sdpOffer = req.body?.sdp;
      if (!sdpOffer) {
        res.status(400).json({ error: "Missing SDP offer" });
        return;
      }

      // Try to load user memory for this session (authenticated users only)
      let userMemory: string | null = null;
      try {
        const user = await sdk.authenticateRequest(req);
        if (user?.id) {
          userMemory = await getUserMemory(user.id);
        }
      } catch {
        // Unauthenticated or memory unavailable — proceed without memory
      }

      // Build multipart FormData with sdp and session fields
      // (unified interface requires multipart/form-data, NOT raw SDP body)
      const sessionConfig = JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1",
        instructions: buildVoiceSystemPrompt(userMemory),
        // Audio config is nested under `audio` in the GA realtime schema.
        // A top-level `voice` (the old beta shape) is now rejected outright with
        // "Unknown parameter: 'session.voice'", which fails the whole call and
        // makes the session unstartable — so voice, transcription and turn
        // detection are all set here, at call creation, in the nested form.
        audio: {
          input: {
            // Most accurate transcription model the realtime API accepts (the
            // full list is whisper-1, gpt-realtime-whisper, gpt-live-transcribe,
            // gpt-transcribe, gpt-4o-transcribe, gpt-4o-mini-transcribe).
            // Roughly half the error rate of whisper-1 on accented speech, which
            // is what a learner speaking French actually sounds like. This only
            // feeds the on-screen transcript — Romain hears the raw audio — so
            // accuracy matters more here than the latency gpt-live-transcribe
            // would buy us.
            transcription: { model: "gpt-transcribe" },
            // semantic_vad no longer accepts threshold / prefix_padding_ms /
            // silence_duration_ms; eagerness "low" waits longer before deciding
            // the user has finished, which is what those knobs were tuning for.
            turn_detection: { type: "semantic_vad", eagerness: "low" },
          },
          // "cedar" is the masculine voice for Romain.
          output: { voice: "cedar" },
        },
        tools: VOICE_TOOLS,
        tool_choice: "auto",
      });

      const formData = new FormData();
      // Send as plain string fields (not file uploads) — OpenAI expects field names "sdp" and "session"
      formData.append("sdp", sdpOffer);
      formData.append("session", sessionConfig);

      // Relay SDP offer to OpenAI Realtime unified interface
      const response = await fetch(
        `https://api.openai.com/v1/realtime/calls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const err = await response.text();
        console.error("[Voice] OpenAI SDP relay error:", response.status, err);
        res.status(response.status).json({ error: err });
        return;
      }

      const answerSdp = await response.text();
      res.setHeader("Content-Type", "application/sdp");
      res.send(answerSdp);
    } catch (e: any) {
      console.error("[Voice] SDP relay exception:", e);
      res.status(500).json({ error: e.message ?? "Unknown error" });
    }
  });

  // ── Session config endpoint — POST /api/voice/session-config ─────────────────
  // Returns the base system prompt (memory included) for the current user.
  // A session.update REPLACES `instructions` rather than appending to them, so
  // the browser needs the base prompt in hand to re-send it verbatim alongside
  // the per-user speed / language-mix lines. Without this the first
  // session.update would silently wipe Romain's persona and tool guidance.
  app.post("/api/voice/session-config", async (req, res) => {
    let userMemory: string | null = null;
    try {
      const user = await sdk.authenticateRequest(req);
      if (user?.id) {
        userMemory = await getUserMemory(user.id);
      }
    } catch {
      // Unauthenticated or memory unavailable — fall back to the static prompt
    }
    res.json({
      instructions: userMemory ? buildVoiceSystemPrompt(userMemory) : VOICE_SYSTEM_PROMPT,
    });
  });

  // Health check (used by Railway and other hosting platforms)
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", ts: Date.now() });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background cron jobs after server is ready
    startCronJobs();
  });
}
startServer().catch(console.error);
