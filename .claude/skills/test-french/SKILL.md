---
name: test-french
description: Run the french-voice-tutor test suite (logic tier and/or live-API tier) and interpret failures against the known production runbook. Use when asked to test the french project, check if the site/APIs are working, or diagnose a failing check.
---

# Testing the french-voice-tutor project

This project has **two test tiers**. Pick the right one for the ask.

pnpm is not on PATH — always call it via `corepack pnpm`. Run from the repo root
(`/Users/chen/french-voice-tutor`).

## Logic tier — `corepack pnpm test`

Fast, deterministic, no secrets or network. Runs everything except
`server/**/*.live.test.ts`. This should be **green anywhere**; a red here is a
real code regression. Use this for normal "run the tests" requests.

## Live tier — `corepack pnpm run test:live`

Runs only `*.live.test.ts` (DeepSeek + Gemini key checks) against the real APIs.
The `test:live` script wraps vitest in `railway run`, which injects the
production secrets into the process. Use this when asked to verify the API keys
or check that the live integrations still work.

- **Prerequisite (one-time):** the repo must be linked to Railway:
  `railway link --project "French Tutor" --service french-voice-tutor`
- It spends **real production API quota** — run it deliberately, not in a loop.
- Never print `railway run env` / raw variable values; the keys are secret.

## Interpreting failures (runbook)

Cross-reference the fuller `french-tutor-production` runbook in memory.

- **Live-tier fails with 401/403 (or `apiKey ... toBeTruthy` fails):** the
  DeepSeek or Gemini key is expired/invalid or missing in Railway. Rotate the
  key in Railway variables (`railway variables --service french-voice-tutor`).
- **Site is down / `/api/health` not 200 (nightly `uptime` job red):** usually a
  Railway *migration* that rebuilt a stale commit. **Recovery = push a commit to
  `main`** to trigger a fresh auto-deploy. **Do NOT run `railway redeploy`** — it
  re-runs the same crashed deployment.
- **Google Drive sync `invalid_grant`:** the user's Google refresh token died
  (OAuth consent screen is in "Testing" → 7-day expiry). Reconnect via
  `https://romaintalk.com/api/auth/google/login?returnPath=/` and check BOTH
  scopes on the consent screen. Not a code bug.

## How this relates to CI

`.github/workflows/test.yml` runs the **logic tier** on every push to `main`.
`.github/workflows/nightly-health.yml` runs the **uptime + live-API** checks
nightly (and on manual dispatch) and emails on failure. The skill is the
interactive counterpart — the CI runs the same underlying commands unattended.
