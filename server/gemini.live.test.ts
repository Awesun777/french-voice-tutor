import { describe, it, expect } from "vitest";

describe("Google AI API key", () => {
  it("should be able to call Gemini API", async () => {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    expect(apiKey).toBeTruthy();

    // Just list models to confirm key is valid (lightweight call)
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`
    );
    const data = await res.json() as { models?: unknown[]; error?: { message: string } };

    expect(data.error).toBeUndefined();
    expect(data.models).toBeDefined();
    expect(Array.isArray(data.models)).toBe(true);
  }, 15000);
});
