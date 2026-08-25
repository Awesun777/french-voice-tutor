---
name: tcf-sujet
description: Generate new Tâche 2 role-play sujets for Marc's TCF exam — writes the scenario, renders the exam sheet in ChatGPT via Chrome, and wires it into tcfSujets.ts and the ElevenLabs agent. Use when asked to add a TCF sujet, add a role-play question, or give Marc more Task 2 scenarios.
---

# Adding a Tâche 2 sujet

Run from the repo root (`/Users/chen/french-voice-tutor`). pnpm is not on PATH —
always `corepack pnpm`.

```
/tcf-sujet --count 3            # 3 sujets on themes picked for you
/tcf-sujet restaurant banque    # named themes
/tcf-sujet --finish             # skip generation, wire up PNGs already on disk
```

`--count` defaults to 1. Named themes and `--count` can be combined; named ones
go first.

The whole run is **resumable**. Every step skips work whose output already
exists, so re-running after a stall picks up where it stopped. Never delete a
generated PNG to "start clean" without asking.

## A — choose themes

Read `client/src/lib/tcfSujets.ts` for the ids already taken. Pick unused
everyday-life service scenarios per `references/scenario-spec.md`. Ids are
kebab-case and single-word where possible (`restaurant`, `medecin`, `gare`,
`banque`, `gym`, `ecole`, `garagiste`).

The sujet **number** is `Object.keys(TASK2_SUJETS).length + 1` at the time the
sujet is added, counting up across the batch. Number 1 is the real official
paper and is never regenerated.

## B — write the sujet

For each theme, produce against `references/scenario-spec.md`:

- `id`, `label` (`Tâche 2 — Sujet <N>`, em dash), `consigne`
- three options with their caption lines
- `alt` — one French sentence, `"Document du sujet : "` then the three options
  summarised, matching the shape of the `logement` entry
- `apercu` — the spoken clause naming what the document shows, e.g. *« trois
  annonces : un studio, un deux-pièces et une maison individuelle »*. Marc says
  it aloud right after the consigne, so it must read naturally mid-sentence.
- `fiche` — **Marc's private fact sheet**, the single most important field and
  the one with no equivalent on the printed sheet. The document withholds one
  axis on purpose (*« Loyer : voir avec l'agence »*); `fiche` is where those
  withheld figures live, because the candidate has to *ask* for them. One
  bullet per option carrying the concrete numbers, plus a final bullet of the
  provider's general conditions. Copy the density of the `logement` entry.
- the filled ChatGPT prompt from `references/sheet-prompt.md`

A sujet with a thin `fiche` produces a dead exchange — the candidate runs out of
things to ask inside a minute. Budget more effort here than on the image.

Write each prompt to `docs/tcf-sujets/<id>.prompt.md` before rendering. That
file is the record of what was asked for, and it is what a retry re-sends.

## C — render the sheet in Chrome

Per sujet, unattended. Tell the user before starting that Chrome will be busy
and taking keyboard input for the duration of the batch.

1. `tabs_create_mcp` → `https://chatgpt.com/`. Do not reuse an existing tab.
2. Attach `client/public/tcf/task2-sujet1-logement.png` as the style reference
   (`file_upload`). **Always the official sheet** — never a generated one.
3. Paste the prompt from `docs/tcf-sujets/<id>.prompt.md`, send.
4. Wait for the render. These are slow; poll with `read_page` rather than
   assuming a fixed delay, and give it several minutes before treating it as
   stalled.
5. Download the image to `~/Downloads`, then move it to
   `client/public/tcf/task2-sujet<N>-<id>.png`.
6. Read the PNG back and **look at it**. Reject and re-render once if: any
   French word is misspelt, an accent is missing, the grey consigne band is
   absent, there are not exactly three photos, or text has been invented. After
   one failed retry, leave the sujet unwired and report it rather than shipping
   a bad sheet.
7. Close the tab.

If a sujet's PNG already exists, skip straight to D.

Never trigger a browser dialog — no "Delete chat", no downloads that prompt.

## D — wire into the repo

Append to `TASK2_SUJETS` in `client/src/lib/tcfSujets.ts`, matching the existing
entry's formatting exactly (multi-line strings built with `+` concatenation).
Leave `Task2Sujet`, `resolveTask2Sujet`, `pickTask2Sujet` and
`DEFAULT_TASK2_SUJET` alone — the default stays on `logement`.

That is the whole wiring. The new sujet joins the random draw and appears in
MarcExamTab's **Sujet** select automatically; both read `TASK2_SUJETS` directly.

## E — the ElevenLabs agent needs nothing

Deliberately. `scripts/patch-marc-task2-prompts.ts` templated the Task 2 node
prompts once, so they interpolate `{{consigne_task2}}`, `{{apercu_task2}}` and
`{{fiche_task2}}` from the dynamic variables MarcExamTab ships for the sujet it
drew. Only the scenario in play reaches the model, and the prompt does not grow
as the bank does.

Do not re-add a per-sujet sync, and do not put a `sujet_id` enum back on the
`afficher_sujet` tool — an enum goes stale the moment a sujet is added, and the
client already settles which sheet is shown before connecting.

**Do not** set `forced_tool_name` on `task2_setup` either. It re-forces the tool
on every agent turn while the node is active, and Marc loops on `afficher_sujet`
forever without ever speaking. The step-1 prompt instruction fires it exactly
once. This has been established the hard way.

## F — verify

1. `corepack pnpm test`
2. `corepack pnpm exec tsc --noEmit`
3. `corepack pnpm dev`, open the Marc tab, pin each new sujet in the **Sujet**
   select, jump to **Tâche 2**: the sheet renders, the consigne on screen
   matches the consigne in the image, **Agrandir** opens the lightbox.

For a deeper check that Marc reads the right consigne and answers from the right
fact sheet, use the text-only WebSocket probe described in the
`marc-tcf-workflow` memory rather than driving the UI: connect with
`conversation.text_only: true` and `dynamic_variables` carrying `phase_depart:
"tache2"` plus the sujet's `consigne_task2` / `apercu_task2` / `fiche_task2`,
then ask a question whose answer only exists in the fiche.
`/simulate-conversation` does **not** execute the workflow graph and cannot test
this.

## Reporting

End with one line per sujet: id, number and PNG path. Name any sujet left
unwired and why.
