import { describe, expect, it } from "vitest";
import { parseSpeaker, transcodeUrl } from "./commonsAudio";

describe("parseSpeaker", () => {
  it("extracts the speaker from a Lingua Libre file title", () => {
    expect(parseSpeaker("File:LL-Q150 (fra)-WikiLucas00-essayer.wav", "essayer")).toBe("WikiLucas00");
    expect(parseSpeaker("File:LL-Q150 (fra)-0x010C-fille.wav", "fille")).toBe("0x010C");
  });
  it("keeps hyphens and parentheses inside speaker names", () => {
    expect(parseSpeaker("File:LL-Q150 (fra)-Pamputt (avec accent)-oiseau.wav", "oiseau")).toBe("Pamputt (avec accent)");
  });
  it("handles accented words and case-insensitive suffix match", () => {
    expect(parseSpeaker("File:LL-Q150 (fra)-Lunagrouh-Été.wav", "été")).toBe("Lunagrouh");
  });
  it("returns empty for a non-matching title", () => {
    expect(parseSpeaker("File:Something else.wav", "mot")).toBe("");
  });
});

describe("transcodeUrl", () => {
  it("derives the mp3 transcode path from the original", () => {
    expect(transcodeUrl("https://upload.wikimedia.org/wikipedia/commons/a/ab/LL-Q150_(fra)-X-mot.wav"))
      .toBe("https://upload.wikimedia.org/wikipedia/commons/transcoded/a/ab/LL-Q150_(fra)-X-mot.wav/LL-Q150_(fra)-X-mot.wav.mp3");
  });
});
