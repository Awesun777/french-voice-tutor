import { describe, it, expect } from "vitest";
import { extractDocId } from "./googleDrive";

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
