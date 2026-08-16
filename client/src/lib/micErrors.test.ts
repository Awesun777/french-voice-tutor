import { describe, it, expect } from "vitest";
import { micErrorMessage } from "./micErrors";

const FALLBACK = "Failed to start voice session";

// DOMException isn't constructible with a custom name in every runtime, so
// tests use plain objects shaped like the errors getUserMedia rejects with.
const err = (name: string, message = "The request is not allowed by the user agent") =>
  ({ name, message });

describe("micErrorMessage", () => {
  it("maps NotAllowedError to actionable copy instead of the browser string", () => {
    const msg = micErrorMessage(err("NotAllowedError"), FALLBACK);
    expect(msg).toContain("Microphone access was blocked");
    expect(msg).toContain("Microphone");
    expect(msg).not.toContain("user agent");
  });

  it("treats SecurityError the same as a permission denial", () => {
    expect(micErrorMessage(err("SecurityError"), FALLBACK)).toContain(
      "Microphone access was blocked"
    );
  });

  it("maps NotFoundError and OverconstrainedError to no-mic copy", () => {
    expect(micErrorMessage(err("NotFoundError"), FALLBACK)).toContain("No microphone");
    expect(micErrorMessage(err("OverconstrainedError"), FALLBACK)).toContain("No microphone");
  });

  it("maps NotReadableError to mic-busy copy", () => {
    expect(micErrorMessage(err("NotReadableError"), FALLBACK)).toContain("in use");
  });

  it("passes through unrecognized errors' own message", () => {
    expect(micErrorMessage(new Error("WebRTC SDP exchange failed"), FALLBACK)).toBe(
      "WebRTC SDP exchange failed"
    );
  });

  it("falls back when the error has no message", () => {
    expect(micErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    expect(micErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(micErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
  });
});
