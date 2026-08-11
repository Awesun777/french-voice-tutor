/**
 * PaletteClut — the brand color lookup table, as an Ops slide-over panel.
 *
 * Documents every color token across the family: this app's tokens
 * (client/src/index.css) plus the News Radar site's variants, which share the
 * brand palette. Swatches and hex values copy on click; contrast ratios are
 * computed at render against each token's real ground, so the table can never
 * drift from WCAG arithmetic the way a hand-maintained doc would.
 */

import { motion, AnimatePresence } from "framer-motion";
import { X, Palette } from "lucide-react";
import { toast } from "sonner";

// [token, hex, fgOnIt (null = not a text ground), groundItSitsOn, role]
type Row = [string, string, string | null, string | null, string];

const BRAND: Array<[string, string]> = [
  ["Navy", "#173F6B"],
  ["Burgundy", "#A63D4A"],
  ["Friendly Blue", "#5CA8D6"],
  ["Pale Blue", "#DCECF8"],
  ["Rose Mist", "#F4E0E3"],
  ["Warm Cream", "#FFF8ED"],
  ["Charcoal", "#252321"],
  ["Muted Gray", "#6F6A64"],
];

const SECTIONS: Array<{ title: string; note: string; rows: Row[] }> = [
  {
    title: "Surfaces & text",
    note: "Light-only by design — warm cream ground, white cards so pale blue stays reserved for practice surfaces.",
    rows: [
      ["--background", "#FFF8ED", "#252321", null, "Page ground — warm cream"],
      ["--foreground", "#252321", null, "#FFF8ED", "Body text — charcoal on cream"],
      ["--card", "#FFFFFF", "#252321", "#FFF8ED", "Cards float on cream; white keeps pale blue special"],
      ["--sidebar", "#FBF2E4", "#252321", "#FFF8ED", "One shade deeper than the page, so it separates"],
      ["--muted-foreground", "#6F6A64", null, "#FFF8ED", "Secondary text — muted gray"],
      ["--border / --input", "#CBD9E6", null, "#FFF8ED", "Pale blue darkened ~12% into a visible hairline"],
      ["--sidebar-border", "#EFE2CE", null, "#FBF2E4", "Warm hairline for rules that shouldn't read blue"],
    ],
  },
  {
    title: "Interactive & identity",
    note: "Navy leads; friendly blue marks selection and never carries white text — deep navy #17384F rides on it instead.",
    rows: [
      ["--primary", "#173F6B", "#FFF8ED", null, "Navy — buttons, links, active states"],
      ["--secondary / --muted", "#DCECF8", "#173F6B", null, "Pale blue — chips, hovers, practice surfaces"],
      ["--accent", "#5CA8D6", "#17384F", null, "Friendly blue — selection, illustrations"],
      ["--accent-strong", "#22648C", null, "#FFF8ED", "Friendly blue darkened to work as text/icons"],
      ["--ring", "#173F6B", null, "#FFF8ED", "Focus rings — same navy as primary"],
    ],
  },
  {
    title: "Speaking & semantic roles",
    note: "Burgundy is the voice of the app. Destructive is deliberately shifted to #C0392B so errors never read as “speaking.”",
    rows: [
      ["--speaking", "#A63D4A", "#FFF8ED", null, "Burgundy — mic, waveforms, pronunciation"],
      ["--speaking-surface", "#F4E0E3", "#A63D4A", null, "Rose mist — speaking prompts, accent surfaces"],
      ["--destructive", "#C0392B", "#FFF8ED", null, "Errors — shifted off burgundy on purpose"],
      ["--star", "#A6741A", null, "#FFF8ED", "Starred words — ochre deepened to clear 3:1 for icons"],
    ],
  },
  {
    title: "Charts",
    note: "Five categorical hues. Chart-3 darkens friendly blue for mark legibility; chart-4 is the raw gold the star token had to abandon (2.88:1 as an icon).",
    rows: [
      ["--chart-1", "#173F6B", null, "#FFFFFF", "Navy"],
      ["--chart-2", "#A63D4A", null, "#FFFFFF", "Burgundy"],
      ["--chart-3", "#3E8CBC", null, "#FFFFFF", "Friendly blue, darkened for marks"],
      ["--chart-4", "#C08A2E", null, "#FFFFFF", "Gold — chart marks only, never icons"],
      ["--chart-5", "#4A7C59", null, "#FFFFFF", "Green"],
    ],
  },
  {
    title: "News Radar variants",
    note: "The digest site reuses the family and adds category accents, plus an amber one step deeper than our star — it labels 13px bold text, which needs the full 4.5:1.",
    rows: [
      ["--accent-models", "#22648C", null, "#FFFFFF", "Models & APIs category"],
      ["--accent-apps", "#A63D4A", null, "#FFFFFF", "Language Apps category (burgundy)"],
      ["--accent-inspiration", "#4A7C59", null, "#FFFFFF", "Build Inspiration category"],
      ["--accent-general", "#6F6A64", null, "#FFFFFF", "General AI — deprioritized, pinned last"],
      ["--amber", "#9C6D18", null, "#FFFFFF", "“Why it matters” label — 13px bold needs 4.5:1"],
      ["--faint", "#7A746B", null, "#FFFFFF", "Source labels — real text, 4.63:1 on white"],
    ],
  },
];

// ── WCAG 2.1 contrast ─────────────────────────────────────────────────────────
function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function copyHex(hex: string) {
  navigator.clipboard?.writeText(hex);
  toast.success(`Copied ${hex}`);
}

function RatioBadge({ ratio }: { ratio: number }) {
  const pass = ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA-Large" : "below 3:1";
  const cls =
    ratio >= 4.5 ? "text-emerald-700 border-emerald-700/30"
    : ratio >= 3 ? "text-star border-star/30"
    : "text-destructive border-destructive/30";
  return (
    <span className={`inline-block font-mono text-[11px] tabular-nums px-2 py-0.5 rounded-full bg-background border whitespace-nowrap ${cls}`}>
      {ratio.toFixed(2)}:1 · {pass}
    </span>
  );
}

export function PaletteClut({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — the left side stays visible but dimmed; click closes. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-foreground/20"
          />
          {/* Panel — the entire right side. */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-y-0 right-0 z-50 w-full md:w-[60%] lg:w-1/2 bg-background shadow-2xl border-l border-border flex flex-col"
            role="dialog"
            aria-label="Color lookup table"
          >
            <div className="flex-shrink-0 h-14 px-5 border-b border-border flex items-center justify-between bg-background/90 backdrop-blur-sm">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Palette className="w-4 h-4 text-speaking" /> Color Lookup Table
                <span className="text-[11px] font-normal text-muted-foreground">index.css · News Radar styles.css</span>
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-8">
              {/* Brand spectrum strip */}
              <div>
                <div className="flex rounded-xl overflow-hidden h-16 shadow-sm ring-1 ring-black/10">
                  {BRAND.map(([name, hex]) => (
                    <button
                      key={hex}
                      onClick={() => copyHex(hex)}
                      title={`${name} ${hex} — click to copy`}
                      className="flex-1 hover:flex-[2] transition-all duration-200 relative group"
                      style={{ background: hex }}
                    >
                      <span
                        className="absolute left-1.5 bottom-1 text-[9px] font-bold uppercase tracking-wide opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                        style={{ color: contrast(hex, "#FFF8ED") > contrast(hex, "#252321") ? "#FFF8ED" : "#252321" }}
                      >
                        {name}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  The eight-color brand family, shared with News Radar. Hover a band for its name; click any swatch or hex below to copy.
                </p>
              </div>

              {SECTIONS.map((s) => (
                <section key={s.title}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-primary mb-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground mb-3 max-w-prose">{s.note}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px] border-collapse">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                          <th className="py-1.5 pr-3 font-bold">Swatch</th>
                          <th className="py-1.5 pr-3 font-bold">Token</th>
                          <th className="py-1.5 pr-3 font-bold">Hex</th>
                          <th className="py-1.5 pr-3 font-bold">Pairing</th>
                          <th className="py-1.5 pr-3 font-bold">Contrast</th>
                          <th className="py-1.5 font-bold">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.rows.map(([token, hex, fgOn, ground, role]) => {
                          const pairFg = fgOn ?? hex;
                          const pairBg = fgOn ? hex : ground ?? "#FFF8ED";
                          const r = contrast(pairFg, pairBg);
                          return (
                            <tr key={token} className="border-b border-border/60 last:border-0">
                              <td className="py-2 pr-3">
                                <button
                                  onClick={() => copyHex(hex)}
                                  title={`Copy ${hex}`}
                                  className="w-10 h-7 rounded-md ring-1 ring-black/10 cursor-pointer block"
                                  style={{ background: hex }}
                                />
                              </td>
                              <td className="py-2 pr-3 font-mono text-xs font-bold text-foreground whitespace-nowrap">{token}</td>
                              <td className="py-2 pr-3">
                                <button
                                  onClick={() => copyHex(hex)}
                                  className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded-md hover:bg-muted/60 transition-colors"
                                >
                                  {hex}
                                </button>
                              </td>
                              <td className="py-2 pr-3">
                                <span
                                  className="inline-flex items-center justify-center w-10 h-7 rounded-md text-[13px] font-bold ring-1 ring-black/10"
                                  style={{ background: pairBg, color: pairFg }}
                                >
                                  Aa
                                </span>
                              </td>
                              <td className="py-2 pr-3"><RatioBadge ratio={r} /></td>
                              <td className="py-2 text-xs text-muted-foreground">{role}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}

              <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
                AA pass = 4.5:1 (normal text) · AA-Large/UI = 3:1 · ratios computed per WCAG 2.1 relative luminance.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
