/**
 * TCF mock exam (admin-only): multi-voice audio for the listening items and
 * an AI explanation per item.
 *
 * Content is Romaintalk's own (shared/tcfMockExams.ts) — nothing is fetched
 * from third-party exam sites. Audio is synthesised one speaker turn at a
 * time so a dialogue gets distinct voices, and every turn lands in tts_cache
 * like any other synthesis, so an item's audio is paid for once ever.
 */
import { invokeLLM } from "./_core/llm";
import { FRENCH_VOICES, synthesizeFrench } from "./tts";
import {
  getTcfMockItem,
  transcriptOf,
  TCF_SECTION_META,
  type TcfMockItem,
  type TcfSpeaker,
} from "@shared/tcfMockExams";

const VOICE_FOR: Record<TcfSpeaker, { voiceId: string; openaiVoice: string }> = {
  narratrice: { voiceId: FRENCH_VOICES.sarah, openaiVoice: "sage" },
  femme: { voiceId: FRENCH_VOICES.anna, openaiVoice: "marin" },
  homme: { voiceId: FRENCH_VOICES.maxime, openaiVoice: "onyx" },
  femme2: { voiceId: FRENCH_VOICES.matilda, openaiVoice: "coral" },
  homme2: { voiceId: FRENCH_VOICES.marco, openaiVoice: "echo" },
};

export interface TcfAudioTurn {
  speaker: TcfSpeaker;
  text: string;
  base64: string;
  mimeType: string;
}

export async function tcfItemAudio(item: TcfMockItem): Promise<TcfAudioTurn[]> {
  if (!item.audio) return [];
  // Sequential on purpose: ElevenLabs concurrency limits are shared with the
  // live voice agents, and a cache-warm item costs nothing anyway.
  const out: TcfAudioTurn[] = [];
  for (const seg of item.audio) {
    const v = VOICE_FOR[seg.speaker];
    const { base64, mimeType } = await synthesizeFrench(seg.text, v);
    out.push({ speaker: seg.speaker, text: seg.text, base64, mimeType });
  }
  return out;
}

export function explanationCacheKey(examId: string, n: number): string {
  return `tcf::v2::${examId}::${n}`;
}

function describeItem(item: TcfMockItem): string {
  const lines: string[] = [];
  lines.push(`Section : ${TCF_SECTION_META[item.section].label} (niveau visé ${item.level})`);
  if (item.audio) lines.push(`Transcription du document audio :\n${transcriptOf(item)}`);
  if (item.passage) lines.push(`Document écrit :\n${item.passage}`);
  if (item.question) lines.push(`Question / phrase : ${item.question}`);
  lines.push(
    "Propositions :\n" +
      item.choices.map((c, i) => `${"ABCD"[i]}. ${c}`).join("\n")
  );
  lines.push(`Bonne réponse : ${item.answer}`);
  lines.push(`Point clé (rédigé par l'auteur) : ${item.note}`);
  return lines.join("\n\n");
}

export async function explainTcfItem(examId: string, n: number): Promise<string> {
  const item = getTcfMockItem(examId, n);
  if (!item) throw new Error("Unknown TCF item");

  const retenir =
    item.section === "structure"
      ? "(3) **À retenir** — la règle de grammaire en une ou deux phrases, puis un deuxième exemple de phrase qui l'applique."
      : "(3) **À retenir** — 2 à 4 mots ou expressions utiles du document, chacun avec une courte glose en anglais entre parenthèses.";
  const resp = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "Tu es un professeur de FLE qui prépare des candidats au TCF. " +
          "Explique un item de test à un apprenant anglophone de niveau intermédiaire. " +
          "Réponds en français simple et clair, en Markdown, sans titre de niveau 1, et sans ajouter d'autre section que les trois demandées. " +
          "Structure : (1) **Pourquoi la bonne réponse est la bonne** — cite le passage ou la réplique qui la justifie ; " +
          "(2) **Pourquoi les autres sont fausses** — une ligne par distracteur, en nommant le piège (mot répété, contresens, hors sujet…) ; " +
          retenir +
          " Reste concis : 150 à 250 mots.",
      },
      { role: "user", content: describeItem(item) },
    ],
    maxTokens: 900,
  });
  const raw = resp.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new Error("Empty explanation");
  return text;
}
