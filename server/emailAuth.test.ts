import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./_core/emailAuth";

describe("email auth password hashing", () => {
  it("round-trips a correct password", async () => {
    const stored = await hashPassword("s3cret-passphrase");
    expect(stored).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(await verifyPassword("s3cret-passphrase", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery stable", stored)).toBe(false);
  });

  it("salts: same password twice gives different hashes, both valid", async () => {
    const a = await hashPassword("même-mot-de-passe");
    const b = await hashPassword("même-mot-de-passe");
    expect(a).not.toBe(b);
    expect(await verifyPassword("même-mot-de-passe", a)).toBe(true);
    expect(await verifyPassword("même-mot-de-passe", b)).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt:00:00")).toBe(false);
    expect(await verifyPassword("x", "scrypt::")).toBe(false);
  });
});
