/**
 * Curated governed-preposition table for common French verbs.
 *
 * The dictionary LLM fills `governedPreposition` / `prepositionExplanation`,
 * but for the classic "verbe + de / + à" lists it must never be wrong or
 * missing — the DeepSeek-precomputed cache shipped "essayer + à" and left the
 * field empty on ~2,700 entries. This table is applied on read (like
 * `enforceLemmaHeadword`), so bad cached entries are corrected without a
 * recompute, and the reminder always shows for these verbs.
 *
 * Only verbs whose pattern is stable and worth reminding about belong here;
 * everything else keeps whatever the model said.
 */

interface PrepRule {
  prep: "à" | "de" | "";
  note: string;
}

const R = (prep: PrepRule["prep"], note: string): PrepRule => ({ prep, note });

export const VERB_PREPOSITIONS: Record<string, PrepRule> = {
  // ── verbe + de ─────────────────────────────────────────────────────────────
  "essayer":      R("de", "essayer DE faire quelque chose — j'essaie de comprendre (I try to understand)."),
  "décider":      R("de", "décider DE faire — elle a décidé de partir (she decided to leave)."),
  "choisir":      R("de", "choisir DE faire — j'ai choisi de rester (I chose to stay)."),
  "finir":        R("de", "finir DE faire — il a fini de manger (he finished eating)."),
  "arrêter":      R("de", "arrêter DE faire — arrête de crier ! (stop shouting!)."),
  "cesser":       R("de", "cesser DE faire — il a cessé de pleuvoir (it stopped raining)."),
  "oublier":      R("de", "oublier DE faire — j'ai oublié de t'appeler (I forgot to call you)."),
  "refuser":      R("de", "refuser DE faire — elle refuse de répondre (she refuses to answer)."),
  "accepter":     R("de", "accepter DE faire — il a accepté de venir (he agreed to come)."),
  "promettre":    R("de", "promettre DE faire — je promets de revenir (I promise to come back)."),
  "permettre":    R("de", "permettre (à quelqu'un) DE faire — ça me permet de travailler (it lets me work)."),
  "empêcher":     R("de", "empêcher (quelqu'un) DE faire — le bruit m'empêche de dormir (the noise keeps me from sleeping)."),
  "éviter":       R("de", "éviter DE faire — évite de sortir tard (avoid going out late)."),
  "regretter":    R("de", "regretter DE faire — je regrette de l'avoir dit (I regret saying it)."),
  "rêver":        R("de", "rêver DE quelque chose / DE faire — je rêve de voyager (I dream of travelling)."),
  "venir":        R("de", "venir DE faire = to have just done — je viens de manger (I just ate). Plain movement takes no preposition before a place: venir à Paris."),
  "se souvenir":  R("de", "se souvenir DE — je me souviens de lui (I remember him). Unlike English 'remember', the de is required."),
  "se dépêcher":  R("de", "se dépêcher DE faire — dépêche-toi de finir (hurry up and finish)."),
  "parler":       R("de", "parler DE quelque chose = to talk about — on parle du film (we're talking about the film). But parler à quelqu'un = talk TO someone."),
  "s'occuper":    R("de", "s'occuper DE — je m'occupe des enfants (I take care of the children)."),
  "profiter":     R("de", "profiter DE — profite du soleil ! (enjoy / make the most of the sun!)."),
  "dépendre":     R("de", "dépendre DE — ça dépend de toi (it depends on you)."),
  "se moquer":    R("de", "se moquer DE — il se moque de moi (he's making fun of me)."),
  "se plaindre":  R("de", "se plaindre DE — elle se plaint du bruit (she complains about the noise)."),
  "remercier":    R("de", "remercier quelqu'un DE quelque chose — je te remercie de ton aide (thank you for your help)."),
  "conseiller":   R("de", "conseiller (à quelqu'un) DE faire — je te conseille de partir tôt (I advise you to leave early)."),
  "proposer":     R("de", "proposer DE faire — il propose de payer (he offers to pay)."),
  "mériter":      R("de", "mériter DE faire — elle mérite de gagner (she deserves to win)."),
  "risquer":      R("de", "risquer DE faire — tu risques de tomber (you might fall)."),
  "menacer":      R("de", "menacer DE faire — il menace de partir (he threatens to leave)."),

  // ── verbe + à ──────────────────────────────────────────────────────────────
  "réussir":      R("à", "réussir À faire — j'ai réussi à ouvrir la porte (I managed to open the door)."),
  "apprendre":    R("à", "apprendre À faire — j'apprends à conduire (I'm learning to drive)."),
  "commencer":    R("à", "commencer À faire — il commence à pleuvoir (it's starting to rain)."),
  "hésiter":      R("à", "hésiter À faire — n'hésite pas à demander (don't hesitate to ask)."),
  "aider":        R("à", "aider (quelqu'un) À faire — elle m'aide à ranger (she helps me tidy up)."),
  "inviter":      R("à", "inviter (quelqu'un) À faire — je t'invite à dîner (I invite you to dinner)."),
  "encourager":   R("à", "encourager (quelqu'un) À faire — il m'encourage à continuer (he encourages me to keep going)."),
  "s'habituer":   R("à", "s'habituer À — je m'habitue au froid (I'm getting used to the cold)."),
  "penser":       R("à", "penser À = to think of/about — je pense à toi (I'm thinking of you). But penser DE = to have an opinion: qu'est-ce que tu penses du film ?"),
  "tenir":        R("à", "tenir À = to care about / insist on — je tiens à venir (I insist on coming)."),
  "renoncer":     R("à", "renoncer À — il a renoncé à fumer (he gave up smoking)."),
  "réfléchir":    R("à", "réfléchir À — réfléchis à ma proposition (think about my offer)."),
  "s'attendre":   R("à", "s'attendre À — je m'attends à une surprise (I expect a surprise)."),
  "participer":   R("à", "participer À — elle participe au concours (she takes part in the competition)."),
  "répondre":     R("à", "répondre À — réponds à ma question (answer my question) — the à is required, unlike English 'answer'."),
  "téléphoner":   R("à", "téléphoner À quelqu'un — je téléphone à ma mère (I phone my mother)."),
  "obéir":        R("à", "obéir À — le chien obéit à son maître (the dog obeys its master)."),
  "plaire":       R("à", "plaire À — ce film plaît à tout le monde (everyone likes this film)."),
  "ressembler":   R("à", "ressembler À — elle ressemble à sa mère (she looks like her mother)."),
  "appartenir":   R("à", "appartenir À — ce livre appartient à Marie (this book belongs to Marie)."),
  "s'intéresser": R("à", "s'intéresser À — je m'intéresse à l'histoire (I'm interested in history)."),
  "assister":     R("à", "assister À = to attend — j'ai assisté au concert (I attended the concert)."),
  "jouer":        R("à", "jouer À for games and sports (jouer au foot), but jouer DE for instruments (jouer du piano)."),
  "continuer":    R("à", "continuer À faire (also accepted: continuer de faire) — il continue à parler (he keeps talking)."),
  "servir":       R("à", "servir À = to be used for — ça sert à couper (it's for cutting). But servir DE = to act as: ça sert de table."),

  // ── direct object, no preposition (traps for English speakers) ─────────────
  "attendre":     R("", "attendre takes a DIRECT object — j'attends le bus (I'm waiting FOR the bus): no preposition, unlike English."),
  "chercher":     R("", "chercher takes a DIRECT object — je cherche mes clés (I'm looking FOR my keys): no preposition."),
  "écouter":      R("", "écouter takes a DIRECT object — j'écoute la radio (I'm listening TO the radio): no preposition."),
  "regarder":     R("", "regarder takes a DIRECT object — je regarde la télé (I'm looking AT / watching TV): no preposition."),
  "payer":        R("", "payer takes a DIRECT object — j'ai payé le repas (I paid FOR the meal): no preposition."),
};

/**
 * Force the curated preposition onto a dictionary word result, keyed on the
 * lemma. Idempotent; applied to freshly-generated AND cached results so wrong
 * or empty cached entries get corrected on read. Verbs not in the table keep
 * whatever the model produced.
 */
export function enforceVerbPreposition<T>(result: T): T {
  const r = result as any;
  if (!r || typeof r !== "object" || r.type !== "word" || r.found === false) return result;
  const lemma = String(r.baseForm || r.word || "").trim().toLowerCase();
  const rule = VERB_PREPOSITIONS[lemma];
  if (!rule) return result;
  r.governedPreposition = rule.prep;
  r.prepositionExplanation = rule.note;
  return result;
}
