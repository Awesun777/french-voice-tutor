/**
 * Admin → Workflow: what Marc's mock TCF exam actually is.
 *
 * The static structure (phases, durations, what each task assesses) comes from
 * `tcfExamStructure.ts`; the node graph and the agent's turn settings are read
 * live from ElevenLabs, so the picture cannot drift away from the deployed
 * agent. When the live read is unavailable the tab still renders everything it
 * knows from the repo and says so, rather than showing an error page.
 */

import { Workflow, FileText, Timer, GitBranch, Wrench, CheckCircle2, AlertTriangle, Info } from "lucide-react";

import { trpc } from "@/lib/trpc";
import { TASK2_SUJETS } from "@/lib/tcfSujets";
import {
  EXAM_PHASES,
  DYNAMIC_VARIABLES,
  OFFICIAL_SECONDS,
  TOTAL_SECONDS,
  formatDuration,
  type ExamPhaseSpec,
} from "@/lib/tcfExamStructure";

const CARD = "bg-card rounded-2xl ring-1 ring-black/5 shadow-sm p-4";
const EYEBROW = "font-display text-[11px] font-bold uppercase tracking-wider text-muted-foreground";

/** The chain, in the order a full sitting walks it. */
const CHAIN = ["opening", "task1", "task2_setup", "task2_exchange", "task3", "feedback"];

function phaseForNode(nodeId: string): ExamPhaseSpec | undefined {
  return EXAM_PHASES.find((p) => p.nodes.includes(nodeId));
}

/** Headline number. Not a chart — one value has no shape worth plotting. */
function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className={CARD}>
      <p className={EYEBROW}>{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">{hint}</p>
    </div>
  );
}

/**
 * The sitting as one proportional bar. Magnitude across five parts of a whole,
 * so: a stacked bar, not five bars. Preparation time is carved out of Tâche 2 in
 * the same hue at a lower weight, because it is part of that task rather than a
 * sixth category.
 */
function Timeline() {
  return (
    <section className={CARD}>
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Timer className="w-5 h-5 text-speaking" /> Where the time goes
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {formatDuration(TOTAL_SECONDS)} end to end, of which {formatDuration(OFFICIAL_SECONDS)} is the official
        TCF Canada clock. The opening and the feedback are Marc's, not the exam's.
      </p>

      <div className="mt-4 flex h-9 w-full gap-[2px] overflow-hidden rounded-lg">
        {EXAM_PHASES.map((p) => {
          const pct = (p.seconds / TOTAL_SECONDS) * 100;
          const prepPct = p.prepSeconds ? (p.prepSeconds / p.seconds) * 100 : 0;
          return (
            <div
              key={p.label}
              className="group relative flex h-full min-w-0 gap-[2px]"
              style={{ width: `${pct}%` }}
              title={`${p.label} — ${formatDuration(p.seconds)}`}
            >
              {p.prepSeconds ? (
                <div
                  className="h-full rounded-[3px] opacity-40"
                  style={{ width: `${prepPct}%`, backgroundColor: p.color }}
                />
              ) : null}
              <div
                className="h-full flex-1 rounded-[3px]"
                style={{ backgroundColor: p.color, opacity: p.officiel ? 1 : 0.75 }}
              />
              {/* Values live in the hover layer, not stamped on every mark. */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-2 py-1 text-[11px] text-popover-foreground shadow-md ring-1 ring-black/5 group-hover:block">
                <span className="font-bold">{p.label}</span> · {formatDuration(p.seconds)}
                {p.prepSeconds ? ` (dont ${formatDuration(p.prepSeconds)} de préparation)` : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Five series, so a legend is mandatory — identity is never colour alone. */}
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {EXAM_PHASES.map((p) => (
          <li key={p.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} />
            <span className="font-semibold text-foreground">{p.label}</span>
            <span className="tabular-nums">{formatDuration(p.seconds)}</span>
            {!p.officiel && <span className="italic">hors barème</span>}
          </li>
        ))}
      </ul>

      {/* The table is the accessible reading of the same numbers. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-3 font-semibold">Phase</th>
              <th className="py-1 pr-3 font-semibold">Durée</th>
              <th className="py-1 pr-3 font-semibold">Ce qui se passe</th>
              <th className="py-1 font-semibold">Évalué sur</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {EXAM_PHASES.map((p) => (
              <tr key={p.label} className="align-top">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: p.color }} />
                    {p.label}
                  </span>
                  <span className="block pl-4 text-[11px] text-muted-foreground">{p.french}</span>
                </td>
                <td className="py-2 pr-3 tabular-nums text-foreground">
                  {formatDuration(p.seconds)}
                  {p.prepSeconds ? (
                    <span className="block text-[11px] text-muted-foreground">
                      dont {formatDuration(p.prepSeconds)} de préparation
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">{p.what}</td>
                <td className="py-2 text-muted-foreground">{p.assessed ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type LiveNode = { id: string; type: string; label: string | null; promptChars: number; forcedToolName: string | null; toolIds: string[]; turnTimeout: number | null };
type LiveEdge = { id: string; source: string; target: string; kind: string; condition: string | null };

/**
 * The graph, drawn rather than listed, because the interesting part is the shape:
 * one linear chain, plus a fan of entry edges off the start node that let a
 * sitting begin at any task.
 */
function ExamGraph({ nodes, edges }: { nodes: LiveNode[]; edges: LiveEdge[] }) {
  // Live order where we know it, then anything the dashboard added since.
  const known = CHAIN.filter((id) => nodes.some((n) => n.id === id));
  const extra = nodes.filter((n) => !CHAIN.includes(n.id) && n.type !== "start").map((n) => n.id);
  const chain = [...known, ...extra];

  const ROW = 78, H = 58, TOP = 8, X = 250, W = 494;
  const height = chain.length * ROW + TOP;
  const rowY = (i: number) => i * ROW + TOP;
  const startY = height / 2;

  const jumps = edges.filter((e) => e.source === "start_node" && chain.includes(e.target));

  return (
    <section className={CARD}>
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <GitBranch className="w-5 h-5 text-speaking" /> The graph
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Every edge out of the start node is an <span className="font-semibold">expression</span> — a deterministic
        test on <code className="text-[11px]">phase_depart</code>, evaluated before anyone speaks. Every edge along
        the chain is judged by the model from the conversation so far.
      </p>

      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 760 ${height}`} className="w-full min-w-[560px]" role="img"
             aria-label={`Workflow graph: start node with ${jumps.length} entry edges into a chain of ${chain.length} nodes`}>
          {/* Entry fan. Drawn first so the node cards sit on top of it. */}
          {jumps.map((e) => {
            const i = chain.indexOf(e.target);
            const ty = rowY(i) + H / 2;
            return (
              <g key={e.id}>
                <path
                  d={`M172,${startY} C212,${startY} 212,${ty} ${X - 6},${ty}`}
                  className={e.kind === "expression" ? "stroke-primary/50" : "stroke-border"}
                  strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke"
                  strokeDasharray={e.kind === "expression" ? undefined : "4 3"}
                />
                <circle cx={X - 6} cy={ty} r="2.5" className={e.kind === "expression" ? "fill-primary/50" : "fill-border"} />
              </g>
            );
          })}

          {/* Chain connectors. */}
          {chain.slice(0, -1).map((id, i) => (
            <path key={id} d={`M${X + 40},${rowY(i) + H} L${X + 40},${rowY(i + 1)}`}
                  className="stroke-border" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />
          ))}

          {/* Start node. */}
          <rect x="16" y={startY - 26} width="156" height="52" rx="12" className="fill-muted stroke-border" strokeWidth="1" />
          <text x="94" y={startY - 6} textAnchor="middle" className="fill-foreground text-[12px] font-bold">start_node</text>
          <text x="94" y={startY + 11} textAnchor="middle" className="fill-muted-foreground text-[10px]">phase_depart</text>

          {chain.map((id, i) => {
            const n = nodes.find((x) => x.id === id);
            const phase = phaseForNode(id);
            const y = rowY(i);
            const jump = jumps.find((e) => e.target === id);
            return (
              <g key={id}>
                <rect x={X} y={y} width={W} height={H} rx="12" className="fill-card stroke-border" strokeWidth="1" />
                {/* Colour ties each node back to its phase in the timeline above. */}
                <rect x={X} y={y} width="5" height={H} rx="2.5" fill={phase?.color ?? "#CBD9E6"} />
                <text x={X + 18} y={y + 24} className="fill-foreground text-[13px] font-bold">{id}</text>
                <text x={X + 18} y={y + 42} className="fill-muted-foreground text-[11px]">
                  {phase ? `${phase.label} — ${phase.french}` : (n?.label ?? "hors phase")}
                </text>
                {jump && (
                  <text x={X - 14} y={y + H / 2 - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
                    {jump.id.replace(/^e_start_/, "")}
                  </text>
                )}
                {n?.toolIds.length ? (
                  <text x={X + W - 16} y={y + 24} textAnchor="end" className="fill-accent-strong text-[10px] font-bold">
                    tool
                  </text>
                ) : null}
                {n?.turnTimeout ? (
                  <text x={X + W - 16} y={y + 42} textAnchor="end" className="fill-muted-foreground text-[10px]">
                    turn {n.turnTimeout}s
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/**
 * Settings that are invisible until they are wrong. Each one here cost real
 * debugging time at least once, so the tab states the expected value rather than
 * just echoing the current one.
 */
function Checks({ nodes, tools, settings }: { nodes: LiveNode[]; tools: any[]; settings: any }) {
  const forced = nodes.filter((n) => n.forcedToolName);
  const sujetTool = tools.find((t) => t.name === "afficher_sujet");

  const checks = [
    {
      ok: forced.length === 0,
      label: "No node forces a tool",
      detail: forced.length
        ? `${forced.map((n) => n.id).join(", ")} sets forced_tool_name — it re-forces on every turn and Marc will loop instead of speaking.`
        : "forced_tool_name is null everywhere. It re-forces on every agent turn, not once on entry.",
    },
    {
      ok: sujetTool ? !sujetTool.hasEnum : true,
      label: "afficher_sujet takes any sujet id",
      detail: sujetTool?.hasEnum
        ? "The sujet_id enum is back. It goes stale the moment a sujet is added — the client already decides which sheet is shown."
        : "No enum to go stale when a sujet is added.",
    },
    {
      ok: sujetTool?.interruptionMode === "disable_during_tool_and_turn",
      label: "The consigne cannot be interrupted",
      detail: `afficher_sujet interruption_mode = ${sujetTool?.interruptionMode ?? "unknown"}. It must cover the turn after the call, which is the scripted consigne.`,
    },
    {
      ok: settings?.backgroundVoiceDetection === true,
      label: "Background voices ignored",
      detail: "vad.background_voice_detection stops a TV or a passer-by from taking the candidate's turn.",
    },
    {
      ok: settings?.disableFirstMessageInterruptions === true,
      label: "The opening survives a cough",
      detail: "Marc's welcome runs about 45 seconds and would otherwise be cut off by any noise.",
    },
  ];

  return (
    <section className={CARD}>
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Wrench className="w-5 h-5 text-speaking" /> Settings that bite
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Read from the live agent. Turn-taking is {settings?.turnEagerness ?? "—"} with a {settings?.turnTimeout ?? "—"}s
        timeout.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start gap-2 py-2">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${c.ok ? "text-foreground" : "text-destructive"}`}>{c.label}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WorkflowTab() {
  const wf = trpc.voice.marcWorkflow.useQuery();
  const live = wf.data?.available ? wf.data : null;
  const sujetCount = Object.keys(TASK2_SUJETS).length;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="max-w-[88rem] mx-auto p-4 sm:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Workflow className="w-6 h-6 text-speaking" /> Workflow
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Marc — TCF Canada, épreuve d'expression orale. The exam runs as a workflow graph on the agent itself,
            so the phases advance on their own and the client only says where to start.
          </p>
        </div>

        {!wf.isLoading && !live && (
          <p className="flex items-start gap-2 rounded-2xl bg-secondary p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Live agent unavailable — showing the structure the repo knows. The graph and the settings checks need
            ELEVENLABS_API_KEY and ELEVENLABS_MARC_AGENT_ID.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Full sitting" value={formatDuration(TOTAL_SECONDS)}
                hint={`${formatDuration(OFFICIAL_SECONDS)} of it is the official clock`} />
          <Stat label="Nodes" value={live ? String(live.nodes.length) : String(CHAIN.length + 1)}
                hint={live ? "live from the agent" : "from the repo"} />
          <Stat label="Tâche 2 sujets" value={String(sujetCount)}
                hint={sujetCount === 1 ? "one scenario — every sitting drills it" : "drawn at random each sitting"} />
          <Stat label="Entry points" value={live ? String(live.edges.filter((e) => e.source === "start_node").length) : "4"}
                hint="full exam, or straight into any task" />
        </div>

        <Timeline />

        {live && <ExamGraph nodes={live.nodes} edges={live.edges} />}

        <div className="grid gap-4 lg:grid-cols-2 items-start">
          <section className={CARD}>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <FileText className="w-5 h-5 text-speaking" /> What the client sends
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Settled before connecting and interpolated inside the node prompts. Only the drawn sujet travels, which
              is why adding a sujet never touches the agent.
            </p>
            <ul className="mt-3 divide-y divide-border">
              {DYNAMIC_VARIABLES.map((v) => (
                <li key={v.name} className="py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <code className="text-[12px] font-bold text-accent-strong">{v.name}</code>
                    <span className="text-[11px] text-muted-foreground">{v.value}</span>
                  </p>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    <span className="font-semibold text-foreground">{v.readBy}</span> — {v.why}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {live && <Checks nodes={live.nodes} tools={live.tools} settings={live.settings} />}
        </div>
      </div>
    </div>
  );
}
