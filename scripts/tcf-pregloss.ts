/**
 * Pre-gloss the TCF Blanc material so the first person to open an item never
 * waits on the LLM: every listening transcript and every reading document
 * (text read off the booklet image) gets its word-by-word gloss generated and
 * stored in dict_cache, exactly as the tcf.gloss route would do lazily.
 *
 *   railway run --service french-voice-tutor -- corepack pnpm exec tsx scripts/tcf-pregloss.ts all
 *   railway run --service french-voice-tutor -- corepack pnpm exec tsx scripts/tcf-pregloss.ts 3 4
 *
 * scripts/tcf_tv5_ingest.py runs this for the series it just uploaded.
 */
import { glossTcfCached, listTcfExams, loadTcfExam, tcfDocumentLines, tcfTranscriptLines } from "../server/tcfMock";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("usage: tsx scripts/tcf-pregloss.ts all | <series> [<series>…] | <examId>…");
  process.exit(2);
}

const exams = await listTcfExams();
const wanted = args.includes("all")
  ? exams.map(e => e.id)
  : args.map(a => (/^\d+$/.test(a) ? `tv5-${a}` : a)).filter(id => exams.some(e => e.id === id));
if (wanted.length === 0) {
  console.error("no matching exams; known:", exams.map(e => e.id).join(", "));
  process.exit(2);
}

let generated = 0;
let cachedHits = 0;
let failed = 0;
for (const id of wanted) {
  const exam = await loadTcfExam(id);
  if (!exam) continue;
  const t0 = Date.now();
  for (const item of exam.items) {
    const jobs: ("transcript" | "document")[] = [];
    if (tcfTranscriptLines(item).length > 0) jobs.push("transcript");
    if (tcfDocumentLines(item).length > 0) jobs.push("document");
    for (const kind of jobs) {
      try {
        const res = await glossTcfCached(id, item.n, kind);
        if (res.cached) cachedHits++;
        else generated++;
      } catch (e) {
        failed++;
        console.error(`  ${id} #${item.n} ${kind}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      }
    }
  }
  console.log(`${id}: done in ${Math.round((Date.now() - t0) / 1000)}s (generated so far ${generated}, cached ${cachedHits}, failed ${failed})`);
}
console.log(`pregloss finished: generated ${generated}, already cached ${cachedHits}, failed ${failed}`);
process.exit(failed > 0 ? 1 : 0);
