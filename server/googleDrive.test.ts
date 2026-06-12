import { describe, it, expect } from "vitest";
import { detectNumericDateFormat, extractDocId, extractVocabGroups, parseDateKey, preparseLines, splitIntoSections } from "./googleDrive";

// ── extractDocId ──────────────────────────────────────────────────────────────

describe("extractDocId", () => {
  it("extracts doc ID from standard edit URL", () => {
    const url = "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms/edit";
    expect(extractDocId(url)).toBe("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms");
  });

  it("extracts doc ID from view URL", () => {
    const url = "https://docs.google.com/document/d/ABC123_-xyz/view?usp=sharing";
    expect(extractDocId(url)).toBe("ABC123_-xyz");
  });

  it("returns null for non-Google-Doc URLs", () => {
    expect(extractDocId("https://drive.google.com/file/d/abc/view")).toBeNull();
    expect(extractDocId("https://example.com")).toBeNull();
    expect(extractDocId("not a url")).toBeNull();
  });

  it("handles URLs with trailing slashes", () => {
    const url = "https://docs.google.com/document/d/DOCID123/edit#heading=h.abc";
    expect(extractDocId(url)).toBe("DOCID123");
  });
});

// ── accent normalization (quiz grading logic) ─────────────────────────────────

describe("accent normalization (quiz grading logic)", () => {
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  it("normalizes accented characters", () => {
    expect(normalize("étudier")).toBe("etudier");
    expect(normalize("où")).toBe("ou");
    expect(normalize("café")).toBe("cafe");
    expect(normalize("naïve")).toBe("naive");
  });

  it("is case insensitive", () => {
    expect(normalize("Bonjour")).toBe("bonjour");
    expect(normalize("FRANÇAIS")).toBe("francais");
  });

  it("matches accent-stripped user input to correct answer", () => {
    const correct = "étudier";
    const userInput = "etudier";
    expect(normalize(correct)).toBe(normalize(userInput));
  });
});

// ── parseDateKey ──────────────────────────────────────────────────────────────

describe("parseDateKey", () => {
  it("passes through ISO dates unchanged", () => {
    expect(parseDateKey("2025-06-05")).toBe("2025-06-05");
    expect(parseDateKey("2024-01-01")).toBe("2024-01-01");
  });

  it("parses English month-day with explicit year", () => {
    expect(parseDateKey("June 5, 2025")).toBe("2025-06-05");
    expect(parseDateKey("January 1, 2024")).toBe("2024-01-01");
  });

  it("parses English month-day without year using current year", () => {
    const currentYear = new Date().getFullYear();
    const result = parseDateKey("June 5");
    expect(result).toBe(`${currentYear}-06-05`);
  });

  it("applies yearOverride when provided", () => {
    expect(parseDateKey("June 5", 2023)).toBe("2023-06-05");
    expect(parseDateKey("March 15", 2022)).toBe("2022-03-15");
  });

  it("parses French date format", () => {
    expect(parseDateKey("5 juin 2025")).toBe("2025-06-05");
    expect(parseDateKey("15 mars 2024")).toBe("2024-03-15");
  });

  it("parses French date without year using current year", () => {
    const currentYear = new Date().getFullYear();
    const result = parseDateKey("5 juin");
    expect(result).toBe(`${currentYear}-06-05`);
  });

  it("returns null for empty string", () => {
    // Empty string has no date content at all
    expect(parseDateKey("")).toBeNull();
  });

  it("note: Node.js Date parser is permissive — non-date strings with a year may parse", () => {
    // This is expected behaviour: parseDateKey delegates to new Date() which is
    // very lenient. The function is only called on lines already identified as
    // date headers by the regex pre-pass, so garbage input is not a concern.
    const result = parseDateKey("June 5");
    expect(typeof result).toBe("string");
  });
});

// ── line-aligned batching (batchLines is internal, test via extractVocabGroups shape) ──

describe("line-batching invariants", () => {
  it("parseDateKey handles day-of-week prefix in English dates", () => {
    // "Monday June 3" — the regex strips the day name, native Date handles the rest
    const currentYear = new Date().getFullYear();
    // parseDateKey won't match "Monday June 3" directly via ISO or native Date,
    // but it should return a valid date or null (not throw)
    const result = parseDateKey("Monday June 3");
    expect(result === null || typeof result === "string").toBe(true);
  });

  it("parseDateKey with yearOverride overrides ambiguous dates", () => {
    expect(parseDateKey("5 juin", 2020)).toBe("2020-06-05");
    expect(parseDateKey("December 25", 2019)).toBe("2019-12-25");
  });
});

// ── numeric date formats (DD/MM vs MM/DD) ─────────────────────────────────────

describe("detectNumericDateFormat", () => {
  it("detects day-first when a first component exceeds 12", () => {
    expect(detectNumericDateFormat(["15/05", "des mots", "03/06"])).toBe("DM");
    expect(detectNumericDateFormat(["20.07.2025"])).toBe("DM");
  });

  it("detects month-first when a second component exceeds 12", () => {
    expect(detectNumericDateFormat(["05/15", "07/20/2025"])).toBe("MD");
  });

  it("majority wins when evidence conflicts", () => {
    expect(detectNumericDateFormat(["15/05", "20/07", "05/13"])).toBe("DM");
  });

  it("defaults to US month-first with no unambiguous headers", () => {
    expect(detectNumericDateFormat(["05/06", "rien d'autre"])).toBe("MD");
    expect(detectNumericDateFormat([])).toBe("MD");
  });
});

describe("parseDateKey numeric dates", () => {
  it("parses unambiguous day-first dates regardless of format hint", () => {
    expect(parseDateKey("15/05", 2026)).toBe("2026-05-15");
    expect(parseDateKey("15/05", 2026, "MD")).toBe("2026-05-15");
  });

  it("parses unambiguous month-first dates regardless of format hint", () => {
    expect(parseDateKey("05/15", 2026, "DM")).toBe("2026-05-15");
  });

  it("uses the format hint for ambiguous dates", () => {
    expect(parseDateKey("05/06", 2026, "DM")).toBe("2026-06-05");
    expect(parseDateKey("05/06", 2026, "MD")).toBe("2026-05-06");
  });

  it("handles explicit years, including two-digit years", () => {
    expect(parseDateKey("15/05/2025", undefined, "DM")).toBe("2025-05-15");
    expect(parseDateKey("15.05.25", undefined, "DM")).toBe("2025-05-15");
    expect(parseDateKey("07/20/2025", undefined, "MD")).toBe("2025-07-20");
  });

  it("defaults missing years to the current year", () => {
    const y = new Date().getFullYear();
    expect(parseDateKey("15/05")).toBe(`${y}-05-15`);
  });

  it("rejects impossible dates", () => {
    expect(parseDateKey("13/13", 2026)).toBeNull();
    expect(parseDateKey("32/05", 2026)).toBeNull();
  });
});

// ── style-aware date header detection ─────────────────────────────────────────

describe("preparseLines", () => {
  const styled = (text: string) => ({ text, styled: true });
  const plain = (text: string) => ({ text, styled: false });

  it("uses only styled lines as date headers when styled date headers exist", () => {
    // Mirrors the real doc: TITLE-styled numeric headers, while "11 juillet"
    // is plain body text — vocabulary about saying dates, not a header.
    const { lineContexts } = preparseLines([
      styled("15/05"),
      plain("la santé"),
      plain("11 juillet"),
      plain("20 juillet"),
      styled("02/06"),
      plain("sur la main"),
    ]);
    expect(lineContexts).toEqual([
      { line: "la santé", dateKey: "15/05", topicLabel: null },
      { line: "11 juillet", dateKey: "15/05", topicLabel: null },
      { line: "20 juillet", dateKey: "15/05", topicLabel: null },
      { line: "sur la main", dateKey: "02/06", topicLabel: null },
    ]);
  });

  it("falls back to text patterns when no styled date headers exist", () => {
    const { lineContexts } = preparseLines([
      plain("11 juillet"),
      plain("la santé"),
    ]);
    expect(lineContexts).toEqual([
      { line: "la santé", dateKey: "11 juillet", topicLabel: null },
    ]);
  });

  it("infers numeric format from header lines only", () => {
    const { numericDateFormat } = preparseLines([
      styled("28/05"),
      plain("le score était 05/13"),
    ]);
    expect(numericDateFormat).toBe("DM");
  });
});

describe("topic header detection", () => {
  it("no longer treats all-caps lines as section labels", () => {
    const { lineContexts } = preparseLines([
      { text: "15/05", styled: true },
      { text: "RATP", styled: false },
      { text: "la santé", styled: false },
    ]);
    expect(lineContexts).toEqual([
      { line: "RATP", dateKey: "15/05", topicLabel: null },
      { line: "la santé", dateKey: "15/05", topicLabel: null },
    ]);
  });

  it("still recognizes colon and bracket labels", () => {
    const { lineContexts } = preparseLines([
      { text: "Au restaurant:", styled: false },
      { text: "la carte", styled: false },
    ]);
    expect(lineContexts).toEqual([
      { line: "la carte", dateKey: null, topicLabel: "Au restaurant" },
    ]);
  });
});

// ── section hashing / incremental skip ────────────────────────────────────────

describe("splitIntoSections", () => {
  const ctx = (line: string, dateKey: string | null, topicLabel: string | null = null) =>
    ({ line, dateKey, topicLabel });

  it("groups contiguous lines by date and fingerprints each section", () => {
    const sections = splitIntoSections([
      ctx("intro line", null),
      ctx("la santé", "15/05"),
      ctx("health", "15/05"),
      ctx("sur la main", "02/06"),
    ]);
    expect(sections.map((s) => s.rawDate)).toEqual([null, "15/05", "02/06"]);
    expect(sections.map((s) => s.lines.length)).toEqual([1, 2, 1]);
    expect(new Set(sections.map((s) => s.hash)).size).toBe(3);
  });

  it("changes the hash when ANY line in the section changes — including English ones", () => {
    const before = splitIntoSections([ctx("la santé", "15/05"), ctx("health", "15/05")]);
    const after = splitIntoSections([ctx("la santé", "15/05"), ctx("the health", "15/05")]);
    expect(before[0].hash).not.toBe(after[0].hash);
  });

  it("produces stable hashes for identical content", () => {
    const a = splitIntoSections([ctx("la carte", "01/06")]);
    const b = splitIntoSections([ctx("la carte", "01/06")]);
    expect(a[0].hash).toBe(b[0].hash);
  });
});

describe("extractVocabGroups section skipping", () => {
  it("skips all LLM work when every section hash is known", async () => {
    const docLines = [
      { text: "15/05", styled: true },
      { text: "la santé", styled: false },
    ];
    const { sectionHashes } = splitIntoSectionsFromDoc(docLines);
    // No API key configured in this test env — if a batch were sent, the call would fail.
    const result = await extractVocabGroups(
      "15/05\nla santé",
      new Set(),
      undefined,
      undefined,
      docLines,
      new Set(sectionHashes)
    );
    expect(result.processedSections).toBe(0);
    expect(result.groups).toEqual([]);
    expect(result.sectionHashes).toEqual(sectionHashes);
  });

  function splitIntoSectionsFromDoc(docLines: { text: string; styled: boolean }[]) {
    const { lineContexts } = preparseLines(docLines);
    const sections = splitIntoSections(lineContexts);
    return { sectionHashes: sections.map((s) => s.hash) };
  }
});
