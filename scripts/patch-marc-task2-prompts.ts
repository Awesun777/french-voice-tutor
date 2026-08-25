/**
 * patch-marc-task2-prompts.ts — make Marc's Task 2 nodes sujet-agnostic.
 *
 *   railway run -- corepack pnpm tsx scripts/patch-marc-task2-prompts.ts          # dry run
 *   railway run -- corepack pnpm tsx scripts/patch-marc-task2-prompts.ts --yes    # apply
 *
 * The agent used to hardcode the `logement` scenario: its id, its consigne, and
 * a fact sheet of rents and availability dates. That made every new sujet an
 * ElevenLabs change as well as a repo change, and a static prompt holding every
 * sujet's fact sheet at once invites Marc to quote the wrong scenario's prices.
 *
 * After this patch the nodes interpolate `{{consigne_task2}}`, `{{apercu_task2}}`
 * and `{{fiche_task2}}`, which MarcExamTab ships as dynamic variables for the one
 * sujet it drew. Adding a sujet is then a repo-only change, and only the scenario
 * in play ever reaches the model.
 *
 * This is a ONE-TIME migration, kept in the repo because it is the record of what
 * the live agent's prompts say. It is idempotent — re-running reports no diff.
 */

const API = "https://api.elevenlabs.io/v1/convai";

const apply = process.argv.includes("--yes");

const key = process.env.ELEVENLABS_API_KEY;
const agentId = process.env.ELEVENLABS_MARC_AGENT_ID;
if (!key || !agentId) {
  console.error("ELEVENLABS_API_KEY and ELEVENLABS_MARC_AGENT_ID must be set — run under `railway run`.");
  process.exit(1);
}
const headers = { "xi-api-key": key, "Content-Type": "application/json" };

const SETUP_PROMPT = `CURRENT EXAM PHASE: TASK 2 SETUP. Administer ONLY this phase; the workflow moves you to the next phase automatically.

## TASK 2 — Exercice en interaction (~3 min 30 of exchange; in this simulation the candidate may take up to 2 minutes to prepare)
Purpose: a role-play where the CANDIDATE leads — they explain what they are looking for and ask YOU questions. This is the reverse of Task 1: you answer, they ask.

THE SUJET FOR THIS EXAM has already been chosen and its document is ready to be put on the candidate's screen. Its consigne is:
« {{consigne_task2}} »
The document shows {{apercu_task2}}. Because the candidate can SEE the document, read the consigne but never recite its contents in detail. Play exactly the role the consigne assigns you, and nothing else.

Administer it with exactly this sequence:

1. FIRST ACTION of this phase, before you say anything: call the \`afficher_sujet\` tool with sujet_id "{{sujet_id}}". That puts the document on the candidate's screen. Never mention the tool or the screen mechanics — just call it and go straight into the SCRIPT.

2. Announce and read the sujet — SCRIPT:
Deuxième tâche : l'exercice en interaction. <break time="0.8s" /> Le sujet est affiché à l'écran devant vous. <break time="0.5s" /> Je vous lis la consigne : <break time="0.5s" /> {{consigne_task2}} <break time="0.8s" /> Vous avez sous les yeux {{apercu_task2}}. <break time="0.8s" /> Vous avez compris ?

(End your turn. Wait.)

3. If the candidate asks who you are or how it works, restate the consigne in your own words in one sentence — your role, their situation — then stop with "D'accord ?".

4. Preparation — SCRIPT:
Bon. Alors, je vous laisse regarder le document et vous préparer pendant deux minutes. <break time="0.6s" /> Dites-moi quand vous êtes prêt, et on commence.

(End your turn. Wait until the candidate says they are ready.)

Register: this is a stranger in a professional setting, so vouvoiement is expected from the candidate throughout. Note silently whether they get it right; do NOT correct them during the exam.

In THIS phase, do only steps 1–4 (show the document, read the consigne, clarify the role, give preparation time). Do NOT start the exchange yet.`;

const EXCHANGE_PROMPT = `CURRENT EXAM PHASE: TASK 2 EXCHANGE. Administer ONLY this phase; the workflow moves you to the next phase automatically.

## TASK 2 — Exercice en interaction (~3 min 30)
The sujet has ALREADY been announced and the document is ALREADY on the candidate's screen — do not re-read the consigne and do not call any tool. Stay in the role the consigne gave you:
« {{consigne_task2}} »
The candidate leads the conversation.

1. Start the exchange — SCRIPT:
Donc, ça fait deux minutes. <break time="0.6s" /> On va commencer notre conversation. Vous commencez. Je vous écoute.

During the exchange:
- Stay fully in role. Vouvoiement throughout.
- Answer with SHORT, realistic answers (1–2 sentences). The candidate must do most of the talking and asking — never take over the conversation.
- Reveal a detail ONLY when the candidate asks for it, and keep every answer consistent with this fact sheet. The document deliberately withholds these figures, so they come from you and from nowhere else. Never invent a fact that contradicts it; if asked something it does not cover, give a plausible answer and stay consistent with it afterwards.

{{fiche_task2}}

- If the candidate stalls or stops asking, prompt gently IN ROLE — "Vous avez d'autres questions ?", "Est-ce qu'il y a une de ces options qui vous intéresse ?" — but never feed them the questions themselves.
- A strong candidate asks 8–10 questions. Let the exchange run its natural course.

Do NOT close the task or announce Task 3 here — the workflow handles the transition.`;

function diff(label: string, before: string, after: string) {
  if (before === after) {
    console.log(`  ${label}: unchanged`);
    return false;
  }
  console.log(`  ${label}: ${before.length} chars -> ${after.length} chars`);
  return true;
}

const agent = await (await fetch(`${API}/agents/${agentId}`, { headers })).json();
const workflow = structuredClone(agent.workflow);

console.log("Workflow node prompts:");
const setupChanged = diff("task2_setup", workflow.nodes.task2_setup.additional_prompt ?? "", SETUP_PROMPT);
const exchangeChanged = diff("task2_exchange", workflow.nodes.task2_exchange.additional_prompt ?? "", EXCHANGE_PROMPT);
workflow.nodes.task2_setup.additional_prompt = SETUP_PROMPT;
workflow.nodes.task2_exchange.additional_prompt = EXCHANGE_PROMPT;

// forced_tool_name re-forces the tool on EVERY agent turn while the node is
// active, not once on entry — it makes Marc loop on afficher_sujet and never
// speak. The step-1 instruction above fires it exactly once. Leave this null.
workflow.nodes.task2_setup.forced_tool_name = null;

// The enum pinned sujet_id to the ids that existed when the tool was created,
// so a new sujet would make Marc name an id the API rejects. The client settles
// which sujet is shown before connecting and ignores a wrong argument anyway.
const toolIds: string[] = workflow.nodes.task2_setup.additional_tool_ids ?? [];
let toolPatch: { id: string; config: any } | null = null;
for (const toolId of toolIds) {
  const { tool_config } = await (await fetch(`${API}/tools/${toolId}`, { headers })).json();
  if (tool_config?.name !== "afficher_sujet") continue;
  const param = tool_config.parameters?.properties?.sujet_id;
  if (!param) break;
  if (param.enum) {
    console.log(`\nTool afficher_sujet (${toolId}): dropping sujet_id enum ${JSON.stringify(param.enum)}`);
    delete param.enum;
    param.description = "Identifiant du sujet affiché — utilise la valeur de {{sujet_id}}.";
    toolPatch = { id: toolId, config: tool_config };
  } else {
    console.log(`\nTool afficher_sujet (${toolId}): enum already dropped`);
  }
  break;
}

if (!setupChanged && !exchangeChanged && !toolPatch) {
  console.log("\nNothing to do — the agent already matches this script.");
  process.exit(0);
}

if (!apply) {
  console.log("\nDry run. Re-run with --yes to apply.");
  process.exit(0);
}

if (toolPatch) {
  const r = await fetch(`${API}/tools/${toolPatch.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ tool_config: toolPatch.config }),
  });
  console.log("tool PATCH:", r.status, r.ok ? "ok" : (await r.text()).slice(0, 500));
  if (!r.ok) process.exit(1);
}

const res = await fetch(`${API}/agents/${agentId}`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ workflow }),
});
console.log("agent PATCH:", res.status, res.ok ? "ok" : (await res.text()).slice(0, 500));
process.exit(res.ok ? 0 : 1);
