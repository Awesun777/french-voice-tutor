/**
 * Email + password auth routes
 *
 * POST /api/auth/email/register → create account, issue session cookie
 * POST /api/auth/email/login    → verify password, issue session cookie
 *
 * Same session-cookie contract as the Google flow in googleOAuth.ts, so
 * context.ts / sdk.verifySession / protectedProcedure work unchanged — an
 * email account is just a user whose openId is "email:<uuid>" instead of
 * "google:<sub>".
 *
 * Passwords are hashed with Node's built-in scrypt (no new dependency),
 * stored as "scrypt:<salt hex>:<hash hex>" so the parameters can be evolved
 * later by versioning the prefix. Verification runs timingSafeEqual and the
 * login route returns the same message for "no such account" and "wrong
 * password" — an attacker probing for registered emails learns nothing.
 */
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const MIN_PASSWORD_LENGTH = 8;
/** Practical shape check only — the address is proven by nothing else here. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function issueSession(req: Request, res: Response, openId: string, name: string) {
  const sessionToken = await sdk.createSessionToken(openId, {
    name,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

export function registerEmailAuthRoutes(app: Express) {
  app.post("/api/auth/email/register", async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const name = String(req.body?.name ?? "").trim() || email.split("@")[0];

      if (!EMAIL_RE.test(email) || email.length > 320) {
        res.status(400).json({ error: "Enter a valid email address." });
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
        return;
      }

      if (await db.getEmailCredentialByEmail(email)) {
        res.status(409).json({ error: "An account with this email already exists — sign in instead." });
        return;
      }
      // A Google user's data lives under their google:<sub> openId. Letting the
      // same address register a password account would create a second, empty
      // user that looks like their account with everything gone.
      const sameEmail = await db.getUserByEmail(email);
      if (sameEmail && sameEmail.loginMethod === "google") {
        res.status(409).json({ error: "This email signs in with Google — use “Continue with Google”." });
        return;
      }

      const openId = `email:${randomUUID()}`;
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "email",
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByOpenId(openId);
      if (!user) {
        res.status(500).json({ error: "Failed to create account." });
        return;
      }
      const passwordHash = await hashPassword(password);
      try {
        await db.createEmailCredential({ userId: user.id, email, passwordHash });
      } catch (err) {
        // Unique-key race: two registrations for one address at once. The row
        // that lost still created a user shell, but with no credential it is
        // unreachable and harmless.
        res.status(409).json({ error: "An account with this email already exists — sign in instead." });
        return;
      }

      await issueSession(req, res, openId, name);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EmailAuth] register error:", err);
      res.status(500).json({ error: "Registration failed." });
    }
  });

  app.post("/api/auth/email/login", async (req: Request, res: Response) => {
    try {
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const fail = () => res.status(401).json({ error: "Incorrect email or password." });

      const cred = await db.getEmailCredentialByEmail(email);
      if (!cred) {
        // Burn a hash anyway so a missing account responds in the same time
        // envelope as a wrong password.
        await hashPassword(password);
        fail();
        return;
      }
      if (!(await verifyPassword(password, cred.passwordHash))) {
        fail();
        return;
      }

      const user = await db.getUserById(cred.userId);
      if (!user) {
        console.error(`[EmailAuth] credential ${cred.id} has no user row`);
        fail();
        return;
      }
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });

      await issueSession(req, res, user.openId, user.name ?? email);
      res.json({ ok: true });
    } catch (err) {
      console.error("[EmailAuth] login error:", err);
      res.status(500).json({ error: "Sign-in failed." });
    }
  });
}
